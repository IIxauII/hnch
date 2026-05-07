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
 * Derive a 64-character hex hash from a password and salt using
 * PBKDF2-SHA-256 with 100K iterations.
 *
 * The salt should be the room UUID so the same password on different
 * rooms produces different hashes.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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
