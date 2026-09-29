/**
 * Pure helpers used by HomePage — extracted so they can be unit-tested
 * directly without spinning up the full component graph (Ionic / Capacitor
 * / DI). All exports are dependency-free.
 */

import type { JoinRejectionReason } from '@hnch/shared';

import type { LastSessionScreen } from '../core/last-session.service';

/**
 * Shown whenever a relay call never got an answer — offline, a wrong relay
 * URL override, or the relay being down. One string for create and rejoin.
 */
export const RELAY_UNREACHABLE_COPY =
  "Couldn't reach the relay. Check your connection and try again.";

/** Home's headline: a greeting once the stored display name has loaded. */
export function greetingFor(displayName: string | null): string {
  const name = displayName?.trim() ?? '';
  return name.length > 0 ? `Hi, ${name}` : 'Welcome';
}

export function routeForScreen(screen: LastSessionScreen, code: string): string {
  switch (screen) {
    case 'lobby':
      return `/lobby/${code}`;
    case 'estimating':
      return `/estimating/${code}`;
  }
}

/**
 * Copy for a relay rejection while rejoining from the recent-sessions list.
 * `unknown-room` is handled inline by the caller; the rest are here so the
 * switch stays exhaustive.
 */
export function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That session isn't active anymore.";
    case 'wrong-password':
      return 'That password is incorrect.';
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return 'That session is full.';
    case 'malformed-credentials':
      return "Couldn't rejoin with the info on file.";
  }
}
