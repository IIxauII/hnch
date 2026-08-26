/**
 * Round commands (writer side) — the single terminal seam both client and CLI
 * call to reveal / skip / discard the *current* round.
 *
 * Each command selects `currentRound`, applies the `canEnterTerminal` gate,
 * stamps the injectable clock (default `Date.now`), then delegates to the
 * low-level `doc-projection` writer. Illegal transitions **no-op with a typed
 * reason** instead of throwing: a lost race (two peers terminating the same
 * round) returns `{ applied: false }`, not an exception. Callers branch on
 * `result.applied` to suppress no-op side effects (haptics, navigation).
 *
 * This concentrates the legality gate that was previously re-spelled in three
 * places (CLI `session.ts`, client `estimating.page`, and the throwing raw
 * writers) behind one interface (#469 / #471 / #472).
 *
 * `startRound` joins the module from the other end: it is the *opening* act
 * rather than a terminal one, and it owns the round id, the timestamp, and
 * the host attribution both surfaces used to hand-roll (#516). A re-vote is
 * `startRound` with a `parentRoundId`, not a second code path.
 */

import type * as Y from 'yjs';
import {
  appendRound,
  projectDoc,
  currentRound,
  revealRound,
  skipRound,
  discardRound,
} from './doc-projection.js';
import type { Round } from './doc.js';
import { canEnterTerminal } from './round-transitions.js';

/**
 * The outcome of a round command. `applied: true` carries the stamped clock
 * value `at`; `applied: false` carries a typed `reason` so a caller can
 * distinguish "nothing to act on" from "someone beat us to it" without
 * re-spelling the gate.
 */
export type TerminalResult =
  | { applied: true; at: number }
  | { applied: false; reason: 'no-current-round' | 'already-terminal' };

/** Injectable clock — defaults to `Date.now`; tests pass a deterministic stub. */
type Clock = () => number;

/**
 * The outcome of `startRound`. `applied: true` carries the id the command
 * minted and the timestamp it stamped, so a caller that wants to navigate to
 * the new round does not have to re-read the doc for it.
 *
 * The refusals are the two states in which there is nothing to attribute the
 * round to:
 *
 *  - `'no-session'` — there is no doc at all. Only the unbound session
 *                     commands adapter returns this; the rule itself is
 *                     handed a doc by construction.
 *  - `'no-host'`    — `settings.hostParticipantId` is unset, so the round has
 *                     no author. A joiner whose settings have not synced yet
 *                     is in exactly this state, and starting a round from it
 *                     used to throw.
 */
export type RoundResult =
  | { applied: true; id: string; at: number }
  | { applied: false; reason: 'no-session' | 'no-host' };

/**
 * The descriptor fields a caller supplies to `startRound`. Deliberately *not*
 * `AppendRoundInit` minus three fields: `id`, `createdAt` and `createdBy` are
 * the command's to decide, so the caller's type never mentions them.
 *
 * `parentRoundId` is what makes a round a re-vote (ADR-0013). The descriptor
 * fields are **not** inherited from the parent here — a caller that wants the
 * parent's title carried over passes it, which keeps "what does this round
 * say" a decision of the surface that has the parent in hand rather than a
 * hidden rule.
 */
export interface StartRoundInit {
  readonly title?: string;
  readonly description?: string;
  readonly ticketId?: string;
  /** Parent round this one re-votes on (ADR-0013). */
  readonly parentRoundId?: string;
  /** ID of the agenda item this round was started from (ADR-0042). */
  readonly agendaItemId?: string;
}

/**
 * Start a round: mint the id, stamp the injectable clock, attribute the round
 * to the session's current host, and append it.
 *
 * The attribution is read from `settings.hostParticipantId` rather than taken
 * from the caller — a round is authored by whoever holds the room, and both
 * surfaces already resolved it that way before this command existed. Refuses
 * with `'no-host'` when no host is set instead of throwing, so the caller
 * branches like it does on every other command in the family.
 *
 * The scale is inherited from `settings.defaultScale` inside `appendRound`,
 * and a `parentRoundId` pointing at a discarded round still throws there: a
 * discarded round is a tombstone and may not anchor a lineage chain, which is
 * a caller bug rather than a lost race.
 */
export function startRound(
  doc: Y.Doc,
  init: StartRoundInit = {},
  clock: Clock = Date.now,
): RoundResult {
  // Falsy rather than `undefined`: the projection types `hostParticipantId`
  // as a `string`, but a joiner whose settings have not synced yet genuinely
  // has none — which is the state this refusal exists for.
  const createdBy = projectDoc(doc).settings.hostParticipantId;
  if (!createdBy) return { applied: false, reason: 'no-host' };

  const id = crypto.randomUUID();
  const at = clock();
  appendRound(doc, {
    id,
    createdAt: at,
    createdBy,
    ...(init.title !== undefined && { title: init.title }),
    ...(init.description !== undefined && { description: init.description }),
    ...(init.ticketId !== undefined && { ticketId: init.ticketId }),
    ...(init.parentRoundId !== undefined && { parentRoundId: init.parentRoundId }),
    ...(init.agendaItemId !== undefined && { agendaItemId: init.agendaItemId }),
  });
  return { applied: true, id, at };
}

/**
 * Select the current round and apply the terminal-legality gate. Returns the
 * active round to mutate, or the `TerminalResult` failure the command should
 * return unchanged.
 */
function activeRoundOrRefusal(doc: Y.Doc): { round: Round } | TerminalResult {
  const round = currentRound(projectDoc(doc));
  if (!round) return { applied: false, reason: 'no-current-round' };
  if (!canEnterTerminal(round.status)) return { applied: false, reason: 'already-terminal' };
  return { round };
}

/** Reveal the current round. No-op (typed reason) when none is active. */
export function revealCurrentRound(doc: Y.Doc, clock: Clock = Date.now): TerminalResult {
  const sel = activeRoundOrRefusal(doc);
  if ('applied' in sel) return sel;
  const at = clock();
  revealRound(doc, sel.round.id, at);
  return { applied: true, at };
}

/** Skip the current round (ADR-0040). No-op (typed reason) when none is active. */
export function skipCurrentRound(doc: Y.Doc, clock: Clock = Date.now): TerminalResult {
  const sel = activeRoundOrRefusal(doc);
  if ('applied' in sel) return sel;
  const at = clock();
  skipRound(doc, sel.round.id, at);
  return { applied: true, at };
}

/**
 * Discard the current round (tombstone; linked agenda item stays `pending`).
 * `by` is the discarding participant id. No-op (typed reason) when none is
 * active.
 */
export function discardCurrentRound(
  doc: Y.Doc,
  by: string,
  clock: Clock = Date.now,
): TerminalResult {
  const sel = activeRoundOrRefusal(doc);
  if ('applied' in sel) return sel;
  const at = clock();
  discardRound(doc, sel.round.id, at, by);
  return { applied: true, at };
}
