/**
 * The one password rule every entry point that can set a room password
 * enforces the same way: `create --password`, `join --password` (explicit
 * or auto-prompted because the room turned out to need one), and the
 * in-session Access settings (`updateAccess` in `session.ts`).
 *
 * A password that is blank after normalization must never silently become
 * "no password" — that would open a room the user meant to protect without
 * telling them. And a password longer than the web client's field allows
 * could never have been typed there, so the CLI refuses it too rather than
 * minting a hash nothing else can match against.
 */

import { MAX_PASSWORD_LENGTH, normalizePassword } from '@hnch/shared';

export type PasswordValidationResult =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly message: string };

/**
 * Normalize and validate a candidate room password. `message` is meant to be
 * printed to the user as-is (stderr, or surfaced through whatever error
 * channel the caller already has).
 */
export function validatePassword(raw: string): PasswordValidationResult {
  const password = normalizePassword(raw);

  if (password === '') {
    return { ok: false, message: 'Password cannot be empty.' };
  }

  // Counted the way the app's fields count: what was typed, not the form it
  // is compared in. That form can be longer — a few letters are written out
  // in NFC — and a password that fits the field there has to pass here.
  if (raw.trim().length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password is too long (at most ${MAX_PASSWORD_LENGTH} characters).`,
    };
  }

  return { ok: true, password };
}
