/**
 * In-memory room store for the hnch relay.
 *
 * Per ADR-0012, the relay holds all room state in RAM — no disk, no
 * external cache. Two indexes back the store:
 *
 *   - `byUuid`: `roomUuid → RoomRecord` — the canonical lookup used
 *     at WS upgrade time, since `WS /ws/:uuid` (ADR-0016) is keyed
 *     by UUID, not code.
 *   - `byCode`: `roomCode → roomUuid` — the resolver consulted by
 *     `GET /rooms/:code` (ADR-0016) so the client can turn a typed
 *     code into the UUID it needs for the socket URL.
 *
 * Snapshot state (`Y.Doc`, `connections`, `lastEmptyAt`) is not yet
 * modelled here — those fields land with the y-websocket wiring in
 * P3 #4. The current shape is the minimum surface the HTTP routes
 * need to mint rooms and serve code lookups.
 */

import type { PasswordHash } from '@hnch/shared'
import type { CodePool } from './code-pool.js'

/**
 * A single room's metadata. The fields that Phase 5 will enforce
 * against (`passwordHash`, `invitesOutstanding`) are already modeled
 * as opaque blobs here so that enforcement can land without touching
 * the wire protocol or the room-store shape.
 */
export interface RoomRecord {
  readonly uuid: string
  readonly code: string
  /**
   * Opaque password-hash blob registered at room-create time.
   * Unset in Phase 3 (permissive). Phase 5 will set this from a
   * field on the `POST /rooms` body.
   */
  readonly passwordHash?: PasswordHash
  /**
   * Set of single-use invite tokens minted by the host. Empty in
   * Phase 3. Phase 5 grows a mint/redeem lifecycle here.
   */
  readonly invitesOutstanding: Set<string>
}

/**
 * The access mode surfaced by `GET /rooms/:code` per ADR-0016.
 *
 * Derived from `RoomRecord` state rather than stored as an
 * independent flag: a room with a password is `'password'`, a room
 * with outstanding invites is `'invite'`, otherwise `'open'`. Phase 3
 * always produces `'open'` because neither gate is set.
 */
export type AccessMode = 'open' | 'password' | 'invite'

export function accessModeOf(record: RoomRecord): AccessMode {
  if (record.passwordHash !== undefined) return 'password'
  if (record.invitesOutstanding.size > 0) return 'invite'
  return 'open'
}

export interface RoomStoreOptions {
  /**
   * UUID generator, injectable for deterministic tests. Defaults to
   * `crypto.randomUUID`, which is available in Node 20+.
   */
  readonly uuidGenerator?: () => string
}

export interface RoomStore {
  /** Mints a new room with a fresh UUID and a unique code from the pool. */
  createRoom(): RoomRecord
  /** Returns the record for a given code, or `undefined` if not live. */
  getByCode(code: string): RoomRecord | undefined
  /** Returns the record for a given UUID, or `undefined` if not live. */
  getByUuid(uuid: string): RoomRecord | undefined
  /**
   * Removes the room from both indexes and releases its code back to
   * the pool. No-op if the UUID is unknown.
   */
  deleteRoom(uuid: string): void
  readonly roomCount: number
}

export function createRoomStore(
  codePool: CodePool,
  options: RoomStoreOptions = {},
): RoomStore {
  const uuidGenerator = options.uuidGenerator ?? (() => crypto.randomUUID())

  const byUuid = new Map<string, RoomRecord>()
  const byCode = new Map<string, string>()

  return {
    createRoom(): RoomRecord {
      const uuid = uuidGenerator()
      const code = codePool.mint()
      const record: RoomRecord = {
        uuid,
        code,
        invitesOutstanding: new Set<string>(),
      }
      byUuid.set(uuid, record)
      byCode.set(code, uuid)
      return record
    },
    getByCode(code: string): RoomRecord | undefined {
      const uuid = byCode.get(code)
      if (uuid === undefined) return undefined
      return byUuid.get(uuid)
    },
    getByUuid(uuid: string): RoomRecord | undefined {
      return byUuid.get(uuid)
    },
    deleteRoom(uuid: string): void {
      const record = byUuid.get(uuid)
      if (record === undefined) return
      byUuid.delete(uuid)
      byCode.delete(record.code)
      codePool.release(record.code)
    },
    get roomCount(): number {
      return byUuid.size
    },
  }
}
