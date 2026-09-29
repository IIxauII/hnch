/**
 * Pure helpers used by JoinPage (and by the pages that surface a join
 * rejection after the fact) — extracted so they can be unit-tested without
 * mounting the Ionic component graph. All exports are dependency-free.
 */

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

/** The navigation that brought the user to the Join page. */
export interface JoinNavigation {
  readonly id: number;
  /** `popstate` is Back / Forward; anything else went somewhere new. */
  readonly trigger: 'imperative' | 'popstate' | 'hashchange';
}

/**
 * What to do with the code in the link the Join page is entered with:
 *
 *  - `'join'` — fill it in and try to join;
 *  - `'fill'` — fill it in and leave it at that;
 *  - `'none'` — the page is as it should be.
 */
export type JoinLinkAction = 'join' | 'fill' | 'none';

/**
 * Decide what entering the Join page with a link means.
 *
 * Ionic keeps the page in its stack, so it is *entered* more often than it
 * is created, and being entered with a link is a reason to join only when
 * the link has just been followed:
 *
 *  - Sent here with a code — by an invite, or by a session that turned the
 *    user away — went somewhere new: join.
 *  - Back from the Lobby, to the page the link had opened, is going back.
 *    Joining again would put the user straight back in the session they are
 *    backing out of; the code is put back in the field and left there.
 *
 * `lastNavigationId` is the navigation the page last acted on, so that one
 * navigation is acted on once however often the page reports being entered.
 */
export function joinLinkAction(input: {
  codeParam: string | null;
  navigation: JoinNavigation | null;
  lastNavigationId: number | null | undefined;
}): JoinLinkAction {
  if (!input.codeParam) return 'none';
  const { navigation } = input;
  // Nothing to go by: the first entry was the link being followed.
  if (navigation === null) return input.lastNavigationId === undefined ? 'join' : 'none';
  if (navigation.id === input.lastNavigationId) return 'none';
  return navigation.trigger === 'popstate' ? 'fill' : 'join';
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
