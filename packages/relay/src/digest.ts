/**
 * Password at rest (contract item 16, D16-B).
 *
 * A room stores `SHA-256(roomUuid ‖ passwordHash)` (UTF-8 text of both, hex
 * out), never the `passwordHash` clients send as `pw`. A leaked row is then not
 * a credential. Nothing changes on the wire: clients still send the PBKDF2
 * hash of ADR-0017, and the relay digests it the same way to compare.
 */

const encoder = new TextEncoder();

async function sha256(roomUuid: string, passwordHash: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(roomUuid + passwordHash));
  return new Uint8Array(digest);
}

export async function passwordDigest(roomUuid: string, passwordHash: string): Promise<string> {
  return [...(await sha256(roomUuid, passwordHash))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Whether `pw` is the hash the room's digest was made from. Constant-time: both
 * sides are 32-byte digests whatever `pw` is, compared with
 * `crypto.subtle.timingSafeEqual`.
 */
export async function passwordMatches(
  roomUuid: string,
  pw: string,
  storedDigest: string,
): Promise<boolean> {
  const submitted = await sha256(roomUuid, pw);
  const stored = hexToBytes(storedDigest);
  if (stored === null || stored.byteLength !== submitted.byteLength) return false;
  return crypto.subtle.timingSafeEqual(submitted, stored);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
