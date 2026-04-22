/**
 * Thin fetch wrappers for the relay's HTTP surface (ADR-0016).
 *
 * The relay's HTTP routes are:
 *
 *   - `POST /rooms` → `{ uuid, code }` — mints a fresh room; the
 *     response pairs the UUID the y-websocket layer will use as the
 *     roomname with the 6-character code the UI surfaces for Join.
 *   - `GET /rooms/:code` → `{ uuid, accessMode }` — resolves a code to
 *     a UUID ahead of the WS upgrade; 404 with
 *     `{ reason: 'unknown-room' }` on miss.
 *
 * Keeping these here rather than inline in the pages means request
 * shape, header policy, and error decoding all live in one place;
 * Phase 5's password/invite additions plug in by extending the return
 * shapes rather than touching every call site.
 */

import type { JoinRejectionReason } from '@hnch/shared'

/** Successful response to `POST /rooms`. Mirrors the relay's type. */
export interface MintedRoom {
  readonly uuid: string
  readonly code: string
}

/** Access mode reported by `GET /rooms/:code`. Mirrors `AccessMode`. */
export type ResolvedAccessMode = 'open' | 'password' | 'invite'

/** Successful response to `GET /rooms/:code`. */
export interface ResolvedRoom {
  readonly uuid: string
  readonly accessMode: ResolvedAccessMode
}

/**
 * Thrown when the relay rejects a resolve lookup with a 4xx that maps
 * to a {@link JoinRejectionReason}. Carries the reason so callers can
 * route the UI without re-parsing the body.
 */
export class RelayRejectionError extends Error {
  constructor(readonly reason: JoinRejectionReason) {
    super(`relay rejected resolve: ${reason}`)
    this.name = 'RelayRejectionError'
  }
}

export interface MintRoomOptions {
  readonly passwordHash?: string
}

/** `POST /rooms` — mints a fresh room, optionally password-protected (ADR-0017). */
export async function mintRoom(
  httpBaseUrl: string,
  options?: MintRoomOptions,
): Promise<MintedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options?.passwordHash ? { passwordHash: options.passwordHash } : {}),
  })
  if (!res.ok) {
    throw new Error(`POST /rooms failed: ${res.status}`)
  }
  const body = (await res.json()) as MintedRoom
  return body
}

/** Response from `PATCH /rooms/:uuid/access` (ADR-0017). */
export interface PatchAccessResponse {
  readonly accessMode: ResolvedAccessMode
}

/**
 * `PATCH /rooms/:uuid/access` — set or remove the password on a live
 * room. Pass `passwordHash` to protect, `null` to revert to open.
 */
export async function patchRoomAccess(
  httpBaseUrl: string,
  uuid: string,
  passwordHash: string | null,
): Promise<PatchAccessResponse> {
  const res = await fetch(`${httpBaseUrl}/rooms/${uuid}/access`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passwordHash }),
  })
  if (!res.ok) {
    throw new Error(`PATCH /rooms/:uuid/access failed: ${res.status}`)
  }
  return (await res.json()) as PatchAccessResponse
}

/**
 * `GET /rooms/:code`. Throws {@link RelayRejectionError} on a 404 the
 * relay reports as `{ reason }`; any other non-ok status surfaces as a
 * generic `Error`.
 */
export async function resolveRoom(
  httpBaseUrl: string,
  code: string,
): Promise<ResolvedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms/${encodeURIComponent(code)}`)
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as {
      reason?: JoinRejectionReason
    } | null
    throw new RelayRejectionError(body?.reason ?? 'unknown-room')
  }
  if (!res.ok) {
    throw new Error(`GET /rooms/:code failed: ${res.status}`)
  }
  return (await res.json()) as ResolvedRoom
}
