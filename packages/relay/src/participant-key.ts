/**
 * Participant keys (ADR-0059).
 *
 * Each device holds one random 256-bit device key (64 hex chars). Its key for a
 * room is `pk = HMAC-SHA-256(deviceKey bytes, UTF-8 room UUID)`, as lowercase
 * hex. The room stores only `SHA-256(roomUuid ‖ pk)`, the password-at-rest
 * idiom of `digest.ts`. Nothing here is ever logged.
 */

import { hexToBytes, passwordDigest } from './digest';

const encoder = new TextEncoder();

/** A device key or `pk`: 64 lowercase hex characters. */
export function isKeyHex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/** `pk` for one room, derived from a device key already checked with {@link isKeyHex}. */
export async function participantKey(deviceKey: string, roomUuid: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(deviceKey)!,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(roomUuid)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** What a room stores for a bound `pk`. */
export const keyDigest = passwordDigest;

/** Compared against when an id has no binding, so bound and unbound take the same work. */
const DUMMY_DIGEST = '00'.repeat(32);

/**
 * Whether `submitted` (a {@link keyDigest}) is the `stored` one. Constant-time;
 * an unbound id (`stored` null) is compared against a dummy and is never a match.
 */
export function keyDigestMatches(stored: string | null, submitted: string): boolean {
  const a = hexToBytes(stored ?? DUMMY_DIGEST);
  const b = hexToBytes(submitted);
  if (a === null || b === null) return false;
  return crypto.subtle.timingSafeEqual(a, b) && stored !== null;
}

/** Longest `did` / `participantId` the relay keeps; longer ones are never bound. */
export const MAX_PARTICIPANT_ID_LENGTH = 128;

/** A participant id the relay can bind: a non-empty string of bounded length. */
export function isParticipantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PARTICIPANT_ID_LENGTH;
}

/** Who a keyed PATCH or handoff says it is: the body's id and the bearer `pk`. */
export interface Caller {
  readonly participantId: string;
  readonly pk: string;
}

/** A keyed create's creator, as `POST /rooms` takes it. */
export interface Creator {
  readonly participantId: string;
  readonly deviceKey: string;
}
