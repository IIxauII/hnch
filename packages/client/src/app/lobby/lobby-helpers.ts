/**
 * Pure helpers used by LobbyPage — extracted so they can be unit-tested
 * directly without spinning up the full LobbyPage component graph.
 */

import { participantRole } from '@hnch/shared';

/** True when a participant's effective role is `'viewer'`. */
export function isParticipantViewer(p: { role?: 'voter' | 'viewer' }): boolean {
  return participantRole(p) === 'viewer';
}
