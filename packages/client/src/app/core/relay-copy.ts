/**
 * What the app says when the relay says no, or says nothing — one place, so
 * the same refusal reads the same wherever it surfaces.
 */

import { MAX_ROOM_PARTICIPANTS, type JoinRejectionReason } from '@hnch/shared';

/**
 * Shown whenever a relay call never got an answer — offline, a wrong relay
 * URL override, or the relay being down.
 */
export const RELAY_UNREACHABLE_COPY =
  "Couldn't reach the relay. Check your connection and try again.";

/**
 * Shown when the relay did answer and something else went wrong on the way
 * into the session. Saying the relay could not be reached would send the
 * user looking at their connection.
 */
export const SESSION_OPEN_FAILED_COPY = "Couldn't open the session. Try again.";

/**
 * Where the refusal reached the user:
 *
 *  - `'join'` — they have just typed or scanned a code;
 *  - `'rejoin'` — they were in the session already, or are coming back to one
 *    this device remembers.
 *
 * It changes the wording only where the two are different things to say. A
 * code that was just typed may be mistyped; a session the device remembers
 * has ended. A password that was just typed is wrong; someone who was in
 * already is asked for one the session did not have, or has changed, since.
 */
export type RejectionContext = 'join' | 'rejoin';

/**
 * Map a `JoinRejectionReason` to user-visible copy. The switch is
 * exhaustive, so a new reason fails the build until it has copy.
 */
export function rejectionCopy(
  reason: JoinRejectionReason,
  context: RejectionContext = 'join',
): string {
  switch (reason) {
    case 'unknown-room':
      return context === 'join'
        ? "That code isn't active. Double-check it with your host."
        : "That session isn't active anymore.";
    case 'wrong-password':
      // On the way back in, nobody has just typed anything: the session was
      // given a password, or a new one, since.
      return context === 'join'
        ? 'That password is incorrect.'
        : "Enter this session's password to get back in.";
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return `This session is full (${MAX_ROOM_PARTICIPANTS} participants max).`;
    case 'malformed-credentials':
      return context === 'join'
        ? "Couldn't join with the info provided."
        : "Couldn't rejoin with the info on file.";
  }
}
