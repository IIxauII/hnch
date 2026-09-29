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
 * A password as it is compared: without the whitespace around it.
 *
 * A session password is said aloud or pasted from a chat, and a keyboard's
 * predictive text adds a space after a word. "banana" set by the host and
 * "banana " typed by a joiner are the same password to both of them. Applied
 * inside {@link hashPassword}, so no entry point — create, change, join, on
 * either surface — can hash a different string for the same password.
 *
 * Exported for the one thing callers still decide themselves: whether
 * anything was typed at all.
 */
export function normalizePassword(password: string): string {
  return password.trim();
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
