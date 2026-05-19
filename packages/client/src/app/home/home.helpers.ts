/**
 * Pure helpers used by HomePage — extracted so they can be unit-tested
 * directly without spinning up the full component graph (Ionic / Capacitor
 * / DI). All exports are dependency-free.
 */

import type { JoinRejectionReason } from '@hnch/shared';

import type { ClientLastSessionEntry, LastSessionScreen } from '../core/last-session.service';
import type { JumpBackInSummary } from './jump-back-in-banner.component';

export function summaryFromCache(cache: ClientLastSessionEntry): JumpBackInSummary {
  return {
    roomCode: cache.roomCode,
    lastScreen: cache.lastScreen ?? 'lobby',
  };
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
 * Defensive fallback copy for relay rejections we don't expect in
 * Phase 3 (the only live reason is `unknown-room`, handled inline).
 * Mirrors the Join page's switch so Phase 5's enforcement turns on
 * without another round of copy work.
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
      return 'That room is full.';
    case 'malformed-credentials':
      return "Couldn't rejoin with the info on file.";
  }
}
