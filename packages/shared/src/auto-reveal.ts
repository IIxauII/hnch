/**
 * Unanimous auto-reveal — rule *and* driver (ADR-0018).
 *
 * This module owns two things:
 *
 *  1. The pure predicate {@link shouldAutoReveal} — the single, deep owner of
 *     the "who counts toward the unanimous denominator?" decision.
 *  2. The driver {@link startAutoReveal} — when to re-evaluate, when *not*
 *     to (presence that cannot be trusted yet), and the call to reveal.
 *     Consumers supply framework-free callbacks; no `Y.Doc`, `Awareness`, or
 *     Angular primitive crosses that seam.
 *
 * *When* to re-evaluate is part of the rule, not adapter business. Keeping
 * the driver here is what stops the two surfaces drifting on that axis — the
 * CLI previously polled `projectDoc` every 250 ms behind a per-round dedupe
 * Set while the client re-derived the same thing inside an Angular `effect`,
 * scoped to the Estimating page's lifetime rather than the session's.
 *
 * The predicate itself applies every filter the rule depends on:
 *
 *  - active roster (`isActiveParticipant`, ADR-0036) — a kicked-but-still-
 *    connected (`leftAt`) participant is excluded from the denominator;
 *  - online (awareness) ∩ role ≠ `viewer` (ADR-0020) — viewers never count;
 *  - abstainers (`ABSTAIN_SENTINEL`, ADR-0041) — excluded from *both*
 *    numerator and denominator, so an all-abstain round does NOT auto-reveal
 *    (the host must reveal manually);
 *  - terminal guard — a round already revealed / skipped / discarded never
 *    re-reveals.
 *
 * Callers supply `(round, projection.participants, onlineIds)` and nothing
 * else — there is no caller-side filtering to drift.
 */

import { isAbstainVote } from './abstain.js';
import { isActiveParticipant, participantRole, type Round } from './doc.js';
import { currentRound, type DocProjection, type ParticipantSnapshot } from './doc-projection.js';

/**
 * Returns `true` when the current round should auto-reveal: at least one
 * online, active, non-viewer, non-abstaining voter exists and every such
 * voter has cast a numeric (non-abstain) vote.
 *
 * @param round         The active round, or `null`/`undefined` when none.
 * @param participants  Raw, unfiltered participant snapshots (the predicate
 *                      applies the active + online + role filters itself).
 * @param onlineIds     Participant ids currently present in awareness.
 */
export function shouldAutoReveal(
  round: Pick<Round, 'status' | 'votes'> | null | undefined,
  participants: readonly ParticipantSnapshot[],
  onlineIds: ReadonlySet<string>,
): boolean {
  // Terminal guard: a round already revealed / skipped / discarded never
  // re-reveals. Only `'voting'` / `'pending'` rounds are eligible.
  if (!round || (round.status !== 'voting' && round.status !== 'pending')) return false;

  const onlineVoterIds = new Set(
    participants
      .filter(
        (p) => isActiveParticipant(p) && onlineIds.has(p.id) && participantRole(p) !== 'viewer',
      )
      .map((p) => p.id),
  );
  if (onlineVoterIds.size === 0) return false;

  const onlineEntries = Object.entries(round.votes).filter(([id]) => onlineVoterIds.has(id));
  const abstainCount = onlineEntries.filter(([, v]) => isAbstainVote(v)).length;
  const numericCount = onlineEntries.length - abstainCount;
  const denominator = onlineVoterIds.size - abstainCount;
  if (denominator <= 0) return false; // all online voters abstained — host must reveal manually
  return numericCount >= denominator;
}

/** True when the session has an active participant other than `selfId`. */
function hasPeers(projection: DocProjection, selfId: string | null): boolean {
  return projection.participants.some((p) => isActiveParticipant(p) && p.id !== selfId);
}

/**
 * The callbacks a consumer supplies to drive auto-reveal. Deliberately
 * framework-free, mirroring {@link ElectionDeps}: the client passes signal
 * reads, the CLI passes closures over its `Y.Doc` and `Awareness`, and
 * neither leaks its transport here.
 */
export interface AutoRevealDeps {
  /** Live doc snapshot, or `null` when no session is attached. */
  projection(): DocProjection | null;
  /**
   * Raw awareness set. Passed through to {@link shouldAutoReveal}, which
   * applies the active / role / abstain filters itself.
   */
  onlineIds(): ReadonlySet<string>;
  /**
   * Whether {@link onlineIds} can be believed right now: the relay's state
   * has applied on the current socket (`onSyncedChange` in `relay-client`,
   * ADR-0050).
   *
   * Unanimity is "every *online* voter has voted". The doc outlives a socket
   * — it is loaded from disk before the socket opens and kept when it drops
   * — but awareness does not: `y-websocket` clears every remote state when a
   * socket closes. Between that and the next sync, a peer that has voted
   * sees itself as the whole room, and would reveal the round for everyone:
   * on a reload, on a network blip, on a dropped connection.
   */
  presenceTrusted(): boolean;
  /**
   * This peer's participant id, or `null` before it has one. Used for one
   * thing: a session nobody else is part of has no one to miscount, so it
   * evaluates whether or not presence is trusted — a solo round still
   * reveals while offline.
   */
  selfId(): string | null;
  /**
   * Register `cb` to fire on *any* projection change, *any* awareness change
   * and *any* change of {@link presenceTrusted}. Returns an unsubscribe
   * function.
   *
   * All three are required. A vote landing is a rounds change; a voter
   * dropping out of awareness shrinks the denominator and can flip the
   * predicate true without the doc moving at all; and a round that went
   * unanimous while this peer was away reveals when trust comes back.
   */
  subscribe(cb: () => void): () => void;
  /**
   * Fire the reveal — in practice `revealCurrentRound(doc)`. Consumers that
   * want the outcome (haptics, a bump counter) read the command's own
   * `TerminalResult` inside this closure; the driver has no use for it.
   */
  reveal(): void;
}

export interface AutoRevealHandle {
  /** Unsubscribe. Idempotent per consumer. */
  stop(): void;
}

/**
 * Start watching for unanimity and reveal the current round when it arrives
 * (ADR-0018).
 *
 * Evaluates once synchronously on construction, then on every notification
 * from {@link AutoRevealDeps.subscribe}. There is no timer and no per-round
 * bookkeeping: {@link shouldAutoReveal}'s terminal guard already returns
 * `false` the moment `revealedAt` is stamped, so a second write cannot
 * occur and nothing has to be remembered between evaluations.
 *
 * Every peer runs this independently and any peer may write — ADR-0018
 * deliberately assigns no host authority, and Yjs merges the concurrent
 * `revealedAt` writes idempotently.
 *
 * The round it evaluates is `currentRound(projection)` — the same selector
 * `revealCurrentRound` uses internally, so the predicate and the command
 * can never disagree about which round is in play.
 */
export function startAutoReveal(deps: AutoRevealDeps): AutoRevealHandle {
  function evaluate(): void {
    const projection = deps.projection();
    if (!projection) return;
    if (!deps.presenceTrusted() && hasPeers(projection, deps.selfId())) return;

    const round = currentRound(projection);
    if (shouldAutoReveal(round, projection.participants, deps.onlineIds())) {
      deps.reveal();
    }
  }

  const unsubscribe = deps.subscribe(evaluate);
  evaluate();

  return {
    stop(): void {
      unsubscribe();
    },
  };
}
