/**
 * Room code utilities per ADR-0008.
 *
 * Codes are 6 characters drawn from an alphabet of 31 characters:
 * 23 uppercase letters (A-Z minus O, I, L — which look like 0, 1, 1)
 * plus 8 digits (2-9 — excluding 0 and 1 for the same reason).
 *
 * Input is case-insensitive and tolerates an optional dash separator
 * (e.g. `K7P-9MR`). Normalized form is uppercase, no dashes.
 *
 * The relay owns the room-code-to-UUID lookup and the retire/release
 * lifecycle tied to ADR-0012's snapshot TTL. This module only covers
 * the format: generation, normalization, validation, and display.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

// Compile-time-ish sanity check: the alphabet must be 31 chars to match ADR-0008.
if (ALPHABET.length !== 31) {
  throw new Error(`Room code alphabet must be 31 characters, got ${ALPHABET.length}`)
}

/**
 * Generates a new room code using cryptographic randomness.
 *
 * Uses `globalThis.crypto.getRandomValues` which is available in both
 * modern Node (20+) and browsers. Rejects bytes that would bias the
 * modulo (bytes >= 248) to guarantee a uniform distribution.
 */
export function generateRoomCode(): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length // 31 * 8 = 248
  const chars: string[] = []
  // Oversample: grabbing 2x bytes means we almost never need a second round.
  const bytes = new Uint8Array(CODE_LENGTH * 2)
  while (chars.length < CODE_LENGTH) {
    globalThis.crypto.getRandomValues(bytes)
    for (let i = 0; i < bytes.length && chars.length < CODE_LENGTH; i++) {
      const b = bytes[i]!
      if (b < max) {
        chars.push(ALPHABET[b % ALPHABET.length]!)
      }
      // else: reject and continue to avoid modulo bias
    }
  }
  return chars.join('')
}

/**
 * Normalizes a room code input: strips dashes, converts to uppercase.
 * Does not validate — use `isValidRoomCode` on the result if you need
 * to check whether the normalized form is well-formed.
 */
export function normalizeRoomCode(input: string): string {
  return input.replace(/-/g, '').toUpperCase()
}

/**
 * Returns true if the given string is a valid room code in normalized
 * form (exact length, only alphabet characters). Callers handling user
 * input should normalize first via `normalizeRoomCode`.
 */
export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}

/**
 * Formats a normalized room code for display, optionally inserting a
 * dash between the first three and last three characters:
 *
 *     formatRoomCode('K7P9MR')        -> 'K7P-9MR'
 *     formatRoomCode('K7P9MR', false) -> 'K7P9MR'
 *
 * Inputs are normalized first, so mixed-case or already-dashed strings
 * are handled. Strings that are not `CODE_LENGTH` after normalization
 * are returned as-is (without a dash) so this function is safe to call
 * on in-progress user input.
 */
export function formatRoomCode(code: string, withDash = true): string {
  const normalized = normalizeRoomCode(code)
  if (!withDash || normalized.length !== CODE_LENGTH) return normalized
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`
}
