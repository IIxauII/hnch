/**
 * Host election — rule *and* driver (ADR-0010, ADR-0048).
 *
 * Single source of truth for the host-election state machine, consumed by
 * both the Angular client and the Ink CLI per ADR-0021 parity. This module
 * owns two things:
 *
 *  1. The pure decision functions {@link evaluateElection} and
 *     {@link resolvePromotion} — given a projection and an awareness set,
 *     what should happen?
 *  2. The driver {@link startElection} — the debounce timer, the
 *     `missingHostId` state, the evaluation switch, and the decision to
 *     promote. Consumers supply five framework-free callbacks; no `Y.Doc`,
 *     `Awareness`, or Angular primitive crosses that seam. The online set it
 *     is fed is the live session's (`live-session`), which owns the presence
 *     shape.
 *
 * *When* to re-evaluate is part of the rule, not adapter business: both
 * adapters subscribe the driver to any projection change plus any awareness
 * change. That axis is exactly where the two hand-transcribed drivers
 * previously drifted — a kicked host (`leftAt` set, awareness entry
 * lingering) is a participants-map change and nothing else.
 *
 * Eligible peer set = **online ∩ active** (ADR-0048): the awareness set
 * intersected with non-`leftAt` participants. A kicked-but-lingering peer
 * (awareness entry still present, `leftAt` set per ADR-0036) is excluded —
 * it can neither win nor block an election. The intersection happens here,
 * once, so both consumers behave identically by construction.
 */

import type { DocProjection } from './doc-projection.js';
import { isActiveParticipant } from './doc.js';

/**
 * Debounce before promoting a new host after the current one drops from
 * awareness. Matches ADR-0010's 5-second window — long enough to absorb
 * transient WebSocket reconnects, short enough that the session doesn't
 * feel leaderless.
 */
export const HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000;

/**
 * The action a driver must take after re-evaluating the election on an
 * awareness/settings change.
 *
 *  - `cancel` — host is online and active; clear any pending debounce.
 *  - `start-debounce` — host is absent and differs from the host already
 *    being debounced; (re)start the timer keyed to `hostId`.
 *  - `none` — no host set, or the same host is already being debounced.
 */
export type EvalResult =
  | { kind: 'cancel' }
  | { kind: 'start-debounce'; hostId: string }
  | { kind: 'none' };

/**
 * Eligible peer set for election: awareness `onlineIds` ∩ active
 * (non-`leftAt`) participants. The single choke point for ADR-0048.
 */
function eligibleIds(projection: DocProjection, onlineIds: ReadonlySet<string>): Set<string> {
  const eligible = new Set<string>();
  for (const p of projection.participants) {
    if (onlineIds.has(p.id) && isActiveParticipant(p)) eligible.add(p.id);
  }
  return eligible;
}

/**
 * Decide what to do when awareness or settings change.
 *
 * @param projection live doc snapshot (host id + participants read from here)
 * @param onlineIds  raw awareness set; intersected with active set internally
 * @param prev       the host id currently being debounced, or `null`
 */
export function evaluateElection(
  projection: DocProjection,
  onlineIds: ReadonlySet<string>,
  prev: { missingHostId: string | null },
): EvalResult {
  const hostId = projection.settings.hostParticipantId;
  if (!hostId) return { kind: 'none' };

  const eligible = eligibleIds(projection, onlineIds);

  // Host online AND active → no action, cancel any pending debounce.
  if (eligible.has(hostId)) return { kind: 'cancel' };

  // Host absent. Start a debounce, or restart if a *different* host went
  // missing (edge case: host changed while the previous debounce was in
  // flight). Same missing host already debouncing → let the timer run.
  if (prev.missingHostId !== hostId) return { kind: 'start-debounce', hostId };

  return { kind: 'none' };
}

/**
 * Decide whether *this* caller should promote itself when the debounce
 * fires. The winner is the lexicographically-lowest eligible participantId;
 * only the winner writes (ADR-0010 §Consequences). Other callers no-op and
 * stand down when they see the doc update.
 *
 * @param projection    live doc snapshot
 * @param onlineIds     raw awareness set; intersected with active internally
 * @param myId          this caller's participantId
 * @param cachedMissing the host id the debounce was started for
 */
export function resolvePromotion(
  projection: DocProjection,
  onlineIds: ReadonlySet<string>,
  myId: string,
  cachedMissing: string | null,
): { promote: true; winner: string } | { promote: false } {
  const hostId = projection.settings.hostParticipantId;

  // The host we started debouncing for must still be the current host.
  if (!cachedMissing || hostId !== cachedMissing) return { promote: false };

  const eligible = eligibleIds(projection, onlineIds);

  // Host came back (online and active) → stand down.
  if (eligible.has(hostId)) return { promote: false };

  const sorted = [...eligible].toSorted();
  if (sorted.length === 0) return { promote: false };

  const winner = sorted[0]!;
  if (winner !== myId) return { promote: false };

  return { promote: true, winner };
}

/**
 * The five callbacks a consumer supplies to drive an election. Deliberately
 * framework-free: the client passes signal reads, the CLI passes closures
 * over its `Y.Doc` and `Awareness`, and neither leaks its transport here.
 */
export interface ElectionDeps {
  /** Live doc snapshot, or `null` when no session is attached. */
  projection(): DocProjection | null;
  /** Raw awareness set; intersected with the active set internally. */
  onlineIds(): ReadonlySet<string>;
  /** This peer's participantId, or `null` before it has resolved. */
  myId(): string | null;
  /**
   * Register `cb` to fire on *any* projection change and *any* awareness
   * change. Returns an unsubscribe function.
   */
  subscribe(cb: () => void): () => void;
  /** Write the promotion. Only ever called on the winning peer. */
  promote(winnerId: string): void;
}

export interface ElectionHandle {
  /** Cancel any armed debounce and unsubscribe. Idempotent per consumer. */
  stop(): void;
}

/**
 * Start watching for host absence and elect a replacement when needed.
 *
 * Evaluates once synchronously on construction, then on every notification
 * from {@link ElectionDeps.subscribe}. When the current host is absent, a
 * {@link HOST_ABSENCE_ELECTION_DEBOUNCE_MS} timer is armed against that
 * specific host id; a *different* host going missing mid-debounce re-keys
 * the timer, and the host returning online-and-active cancels it.
 *
 * A `null` projection or a `null` own id cancels any armed timer and resets
 * the missing-host state — a pending election must not survive teardown of
 * the session it belongs to.
 */
export function startElection(deps: ElectionDeps): ElectionHandle {
  /** The host id the current debounce was armed for, or `null`. */
  let missingHostId: string | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function cancelDebounce(): void {
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    missingHostId = null;
  }

  function tryPromote(): void {
    debounceTimeout = null;
    const cachedMissing = missingHostId;
    missingHostId = null;

    const projection = deps.projection();
    const myId = deps.myId();
    if (!projection || myId === null) return;

    // Only the winner writes — every other peer stands down when it sees the
    // doc update. If two peers compute different winners (awareness drift),
    // Yjs merges deterministically and the loser re-reads (ADR-0010).
    const result = resolvePromotion(projection, deps.onlineIds(), myId, cachedMissing);
    if (result.promote) deps.promote(result.winner);
  }

  function evaluate(): void {
    const projection = deps.projection();
    if (!projection || deps.myId() === null) {
      // No live session (or no identity yet) — nothing to elect against, and
      // an armed timer would fire against a session we have already left.
      cancelDebounce();
      return;
    }

    const result = evaluateElection(projection, deps.onlineIds(), { missingHostId });

    switch (result.kind) {
      case 'cancel':
        cancelDebounce();
        break;
      case 'start-debounce':
        cancelDebounce();
        missingHostId = result.hostId;
        debounceTimeout = setTimeout(tryPromote, HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
        break;
      case 'none':
        break;
    }
  }

  const unsubscribe = deps.subscribe(evaluate);
  evaluate();

  return {
    stop(): void {
      cancelDebounce();
      unsubscribe();
    },
  };
}
