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
 */

import type * as Y from 'yjs';
import {
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
