/**
 * What the app says when the relay says no, or says nothing — one place, so
 * the same refusal reads the same wherever it surfaces.
 */

import { MAX_ROOM_PARTICIPANTS, type HandoffResult, type JoinRejectionReason } from '@hnch/shared';

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

/** Why a refused access change was refused, when the relay says this device is not the host. */
export const ACCESS_NOT_HOST_COPY = 'Only the host can change the password';

/**
 * Why handing the host role to `name` did not happen (ADR-0059): the doc's own refusals, then the
 * relay's. The switch is exhaustive, so a new reason fails the build until it has copy.
 */
export function handoffRefusalCopy(
  reason: Extract<HandoffResult, { applied: false }>['reason'],
  name: string,
): string {
  switch (reason) {
    case 'not-found':
      return `${name} isn't in the session anymore.`;
    case 'not-online':
      return `${name} is offline. Try again once they are back.`;
    case 'self-target':
      // `kick`'s reason; a handoff never gives it.
      return 'You are the host already.';
    case 'not-host':
      return 'Only the host can hand off the host role.';
    case 'bad-target':
      // The relay can only hand to a peer that proves itself, which a released app cannot.
      return `Couldn't make ${name} the host. They may need to update hnch.`;
    case 'unauthenticated':
      return "The relay didn't accept this device as the host.";
    case 'unknown-room':
      return "That session isn't active anymore.";
    case 'unreachable':
      return RELAY_UNREACHABLE_COPY;
  }
}
