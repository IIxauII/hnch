/**
 * Thin fetch wrappers for the relay's HTTP surface (ADR-0016).
 *
 * Ported from packages/client relay-api.ts — same logic, no framework
 * deps. Uses Node 22's native fetch.
 */

import type { JoinRejectionReason } from '@hnch/shared'

export interface MintedRoom {
  readonly uuid: string
  readonly code: string
}

export interface ResolvedRoom {
  readonly uuid: string
  readonly accessMode: 'open' | 'password' | 'invite'
}

export interface MintRoomOptions {
  readonly passwordHash?: string
}

/** `POST /rooms` — mints a fresh room, optionally password-protected. */
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
  return (await res.json()) as MintedRoom
}

/**
 * `GET /rooms/:code` — resolves a room code to UUID + access mode.
 * Throws on unknown room.
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
    throw new Error(`Room not found: ${body?.reason ?? 'unknown-room'}`)
  }
  if (!res.ok) {
    throw new Error(`GET /rooms/:code failed: ${res.status}`)
  }
  return (await res.json()) as ResolvedRoom
}

/**
 * `PATCH /rooms/:uuid/access` — updates room access mode and password.
 */
export async function patchRoomAccess(
  httpBaseUrl: string,
  uuid: string,
  passwordHash: string | null,
): Promise<void> {
  const res = await fetch(`${httpBaseUrl}/rooms/${uuid}/access`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passwordHash }),
  })
  if (!res.ok) {
    throw new Error(`PATCH /rooms/:uuid/access failed: ${res.status}`)
  }
}
