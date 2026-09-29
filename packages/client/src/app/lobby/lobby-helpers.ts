/**
 * Pure helpers used by LobbyPage — extracted so they can be unit-tested
 * directly without spinning up the full LobbyPage component graph.
 */

import { participantRole } from '@hnch/shared';
import type { Round } from '@hnch/shared';

/** True when a participant's effective role is `'viewer'`. */
export function isParticipantViewer(p: { role?: 'voter' | 'viewer' }): boolean {
  return participantRole(p) === 'viewer';
}

/**
 * Heading of the Lobby's results card: `"Round N results"`, where N is the
 * round's number in the session — the same N the Estimating screen showed
 * for it and the History list will show for it later. Returns the empty
 * string when no terminal round exists yet.
 *
 * A re-vote keeps its session number here; that it is a re-vote is a
 * separate note beside the heading (`revoteLabel`).
 */
export function buildResultsHeading(round: Round | null, roundIndex: number | null): string {
  if (round === null || roundIndex === null) return '';
  return `Round ${roundIndex} results`;
}

/**
 * One line under the session code: what the session is called, which scale
 * it votes on, and whether it is locked. Parts that do not apply are left
 * out rather than shown empty.
 */
export function buildSessionSummary(input: {
  name?: string | undefined;
  scaleLabel: string;
  passwordProtected: boolean;
}): string {
  const parts = [
    input.name?.trim() ?? '',
    input.scaleLabel.trim(),
    input.passwordProtected ? 'Password protected' : '',
  ];
  return parts.filter((part) => part.length > 0).join(' · ');
}

/** Label of the host's primary button. */
export function buildRoundCta(hasFinishedRound: boolean, nextRoundNumber: number): string {
  return `${hasFinishedRound ? 'Next round' : 'Start round'} ${nextRoundNumber}`;
}

/**
 * What everyone who is not the host sees in place of that button — the
 * Lobby is otherwise silent about why nothing is happening.
 */
export function buildWaitingNote(hostName: string | null, hasFinishedRound: boolean): string {
  const who = hostName?.trim() || 'the host';
  return `Waiting for ${who} to start the ${hasFinishedRound ? 'next' : 'first'} round.`;
}

/**
 * Toast text shown after a code copy attempt. On failure the dash-formatted
 * code is surfaced inline so the user can still read it.
 */
export function buildCopyRoomCodeToast(success: boolean, code: string): string {
  return success ? 'Code copied' : `Couldn't copy. The code is ${code}`;
}
