/**
 * Pure helpers used by JoinPage (and by the pages that surface a join
 * rejection after the fact) — extracted so they can be unit-tested without
 * mounting the Ionic component graph. All exports are dependency-free.
 */

import type { JoinRejectionReason } from '@hnch/shared';

import type { QrScanErrorReason } from '../core/qr-scanner.service';

/**
 * Returns true when a deep-link auto-submit should be attempted.
 * Both conditions must hold: a code param was present in the URL, and the
 * user already has a display name (guard handles the no-name case separately).
 */
export function shouldAutoSubmitDeepLink(
  codeParam: string | null,
  displayName: string | null,
): boolean {
  if (!codeParam) return false;
  return displayName !== null && displayName.trim().length > 0;
}

/**
 * Returns true when a code the user has just finished typing (or pasting)
 * should be submitted without waiting for a tap on Join.
 *
 * - `codeIsValid` — all six characters are in.
 * - `code` / `lastAttemptedCode` — a code is only ever auto-submitted once.
 *   After a failed attempt the user is editing; re-firing on every keystroke
 *   that happens to land on the same six characters would stack up toasts.
 * - `isSubmitting` — an attempt is already in flight.
 */
export function shouldAutoSubmitTypedCode(input: {
  codeIsValid: boolean;
  code: string;
  lastAttemptedCode: string | null;
  isSubmitting: boolean;
}): boolean {
  if (!input.codeIsValid || input.isSubmitting) return false;
  return input.code !== input.lastAttemptedCode;
}

/**
 * Map a `JoinRejectionReason` to user-visible copy. The switch is
 * exhaustive, so a new reason fails the build until it has copy.
 */
export function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That code isn't active. Double-check it with your host.";
    case 'wrong-password':
      return 'That password is incorrect.';
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return 'This session is full (20 participants max).';
    case 'malformed-credentials':
      return "Couldn't join with the info provided.";
  }
}

/** Map a `QrScanErrorReason` to user-visible copy. */
export function qrScanErrorCopy(reason: QrScanErrorReason): string {
  switch (reason) {
    case 'permission-denied':
      return 'Camera access blocked. Allow camera in browser settings to scan.';
    case 'no-camera':
      return 'No camera available on this device.';
    case 'camera-busy':
      return 'Camera is in use by another app.';
    case 'unavailable':
      return "Scanning isn't supported on this browser.";
    case 'unknown':
      return "Couldn't start the scanner.";
  }
}
