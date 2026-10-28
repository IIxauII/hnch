/**
 * Password hashing per ADR-0017.
 *
 * Uses PBKDF2-SHA-256 via the Web Crypto API — zero external
 * dependencies, available in both browser and Node 20+.
 */

const ITERATIONS = 100_000;
const HASH_BYTES = 32;
const ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * What is dropped from both ends of a password: whitespace, and the
 * characters that take up no room at all — zero-width space, non-joiner,
 * joiner, word joiner. Chat apps put them around what is copied out of them.
 */
const AROUND = /^[\s\u200B-\u200D\u2060]+|[\s\u200B-\u200D\u2060]+$/gu;

/**
 * The longest password there is, counted the way a text field counts it.
 * The fields of the web client stop at this; the CLI, which has no field,
 * refuses what is longer.
 */
export const MAX_PASSWORD_LENGTH = 120;

/**
 * A password as it is compared: in one Unicode form (NFC), without the
 * whitespace and the invisible characters around it.
 *
 * A session password is said aloud or pasted from a chat, and a keyboard's
 * predictive text adds a space after a word. "banana" set by the host and
 * "banana " typed by a joiner are the same password to both of them — and
 * so is "café", whether the keyboard made its last letter in one piece or
 * in two. Applied inside {@link hashPassword}, so no entry point — create,
 * change, join, on either surface — can hash a different string for the
 * same password.
 *
 * What is inside the password stays as it was typed: NFC only ever joins
 * what reads the same, and nothing is folded together (no NFKC, no case).
 *
 * Exported for the one thing callers still decide themselves: whether
 * anything was typed at all.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFC').replace(AROUND, '');
}

/**
 * Derive a 64-character hex hash from a password and salt using
 * PBKDF2-SHA-256 with 100K iterations. The password is normalized first
 * ({@link normalizePassword}).
 *
 * The salt should be the room UUID so the same password on different
 * rooms produces different hashes.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizePassword(password)),
    ALGORITHM,
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    HASH_BYTES * 8,
  );

  return toHex(bits);
}
