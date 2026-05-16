/**
 * Pure helpers used by LobbyPage — extracted so they can be unit-tested
 * directly without spinning up the full LobbyPage component graph.
 */

import { participantRole, resolveRoundLineage } from '@hnch/shared';
import type { Round } from '@hnch/shared';

/** True when a participant's effective role is `'viewer'`. */
export function isParticipantViewer(p: { role?: 'voter' | 'viewer' }): boolean {
  return participantRole(p) === 'viewer';
}

/**
 * Build the results-section heading shown in the Lobby. For re-voted
 * rounds, surfaces the chain position as `"Round N of M Results"`
 * (issue #111). First-round / standalone rounds get `"Round N Results"`.
 * Returns the empty string when no terminal round exists yet.
 */
export function buildResultsHeading(
  round: Round | null,
  roundIndex: number | null,
  allRounds: readonly Round[],
): string {
  if (round === null || roundIndex === null) return '';
  const lineage = resolveRoundLineage(round.id, allRounds);
  if (lineage === null) return `Round ${roundIndex} Results`;
  return `Round ${lineage.depth} of ${lineage.total} Results`;
}

/**
 * Toast text shown after a room-code copy attempt. On failure the dash-formatted
 * code is surfaced inline so the user can still read it.
 */
export function buildCopyRoomCodeToast(success: boolean, code: string): string {
  return success ? 'Room code copied' : `Couldn't copy — code is ${code}`;
}
