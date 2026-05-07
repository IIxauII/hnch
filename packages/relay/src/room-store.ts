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
 * Each `RoomRecord` owns a `Y.Doc` + `Awareness` pair. The doc is the
 * authoritative copy the relay holds in memory and is what makes the
 * ADR-0012 snapshot survive "everyone disconnects, one returns": the
 * y-websocket sync-step-1/2 exchange against this doc hands the
 * returning peer every update accumulated so far.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { PasswordHash } from '@hnch/shared';
import type { CodePool } from './code-pool.js';

/**
 * A single room's metadata plus the live CRDT state.
 *
 * Fields that Phase 5 will enforce against (`passwordHash`,
 * `invitesOutstanding`) are modeled now as opaque blobs so Phase 5
 * lands without touching the wire protocol or the room-store shape.
 *
 * `connections` and `lastEmptyAt` are mutated by the WS handler; the
 * snapshot sweeper (see `snapshot.ts`) evicts rooms whose
 * `connections === 0` and `lastEmptyAt` is older than the TTL.
 */
export interface RoomRecord {
  readonly uuid: string;
  readonly code: string;
  passwordHash?: PasswordHash;
  readonly invitesOutstanding: Set<string>;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  /** Number of currently-live WS connections. */
  connections: number;
  /**
   * Wall-clock timestamp (ms) the room most recently dropped to zero
   * live connections. `undefined` while at least one peer is connected.
   * The snapshot sweeper reads this to decide when a room has been
   * idle long enough to evict.
   */
  lastEmptyAt: number | undefined;
}

/**
 * The access mode surfaced by `GET /rooms/:code` per ADR-0016.
 *
 * Derived from `RoomRecord` state rather than stored as an
 * independent flag: a room with a password is `'password'`, a room
 * with outstanding invites is `'invite'`, otherwise `'open'`. Phase 3
 * always produces `'open'` because neither gate is set.
 */
export type AccessMode = 'open' | 'password' | 'invite';

/**
 * `accessModeOf` only inspects the access-control fields, so we take a
 * structural subset rather than the full `RoomRecord`. This keeps tests
 * (and future call sites that only have a snippet of room state) from
 * having to fabricate a `Y.Doc` + `Awareness` just to ask the question.
 */
export function accessModeOf(
  record: Pick<RoomRecord, 'passwordHash' | 'invitesOutstanding'>,
): AccessMode {
  if (record.passwordHash !== undefined) return 'password';
  if (record.invitesOutstanding.size > 0) return 'invite';
  return 'open';
}

export interface RoomStoreOptions {
  /**
   * UUID generator, injectable for deterministic tests. Defaults to
   * `crypto.randomUUID`, which is available in Node 20+.
   */
  readonly uuidGenerator?: () => string;
}

export interface CreateRoomOptions {
  readonly passwordHash?: PasswordHash;
}

export interface RoomStore {
  /** Mints a new room with a fresh UUID, a unique code, and an empty Y.Doc. */
  createRoom(options?: CreateRoomOptions): RoomRecord;
  /** Returns the record for a given code, or `undefined` if not live. */
  getByCode(code: string): RoomRecord | undefined;
  /** Returns the record for a given UUID, or `undefined` if not live. */
  getByUuid(uuid: string): RoomRecord | undefined;
  /**
   * Set or remove the password hash on a live room. Returns `true` if
   * the room was found and updated, `false` if the UUID is unknown.
   */
  setPasswordHash(uuid: string, hash: PasswordHash | null): boolean;
  /**
   * Removes the room from both indexes, releases its code back to
   * the pool, and tears down its `Y.Doc` / `Awareness`. No-op if the
   * UUID is unknown.
   */
  deleteRoom(uuid: string): void;
  /** Snapshot of all live records, for the TTL sweeper. */
  listRooms(): readonly RoomRecord[];
  readonly roomCount: number;
}

export function createRoomStore(codePool: CodePool, options: RoomStoreOptions = {}): RoomStore {
  const uuidGenerator = options.uuidGenerator ?? (() => crypto.randomUUID());

  const byUuid = new Map<string, RoomRecord>();
  const byCode = new Map<string, string>();

  return {
    createRoom(options?: CreateRoomOptions): RoomRecord {
      const uuid = uuidGenerator();
      const code = codePool.mint();
      const doc = new Y.Doc();
      const awareness = new Awareness(doc);
      const record: RoomRecord = {
        uuid,
        code,
        passwordHash: options?.passwordHash,
        invitesOutstanding: new Set<string>(),
        doc,
        awareness,
        connections: 0,
        lastEmptyAt: Date.now(),
      };
      byUuid.set(uuid, record);
      byCode.set(code, uuid);
      return record;
    },
    getByCode(code: string): RoomRecord | undefined {
      const uuid = byCode.get(code);
      if (uuid === undefined) return undefined;
      return byUuid.get(uuid);
    },
    getByUuid(uuid: string): RoomRecord | undefined {
      return byUuid.get(uuid);
    },
    setPasswordHash(uuid: string, hash: PasswordHash | null): boolean {
      const record = byUuid.get(uuid);
      if (record === undefined) return false;
      record.passwordHash = hash === null ? undefined : hash;
      return true;
    },
    deleteRoom(uuid: string): void {
      const record = byUuid.get(uuid);
      if (record === undefined) return;
      byUuid.delete(uuid);
      byCode.delete(record.code);
      codePool.release(record.code);
      // Tear down CRDT state so the 30s awareness interval + any
      // pending observers don't leak after eviction.
      record.awareness.destroy();
      record.doc.destroy();
    },
    listRooms(): readonly RoomRecord[] {
      return [...byUuid.values()];
    },
    get roomCount(): number {
      return byUuid.size;
    },
  };
}
