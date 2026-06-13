/**
 * Host-election decision functions (ADR-0010, ADR-0048).
 *
 * Single source of truth for the host-election state machine, consumed by
 * both the Angular client (`HostElectionService`) and the Ink CLI
 * (`startElection`) per ADR-0021 parity. These are pure decision functions:
 * they read the shared `DocProjection` + raw awareness set and return the
 * action a driver must take. The debounce timer, `missingHostId` state, and
 * the doc write all live in each driver — never here.
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
