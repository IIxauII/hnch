/**
 * Unit tests for the in-memory room store.
 */

import { describe, expect, it } from 'vitest'
import { createCodePool } from './code-pool.js'
import { accessModeOf, createRoomStore } from './room-store.js'

function freshStore(codes: readonly string[] = ['AAAAAA', 'BBBBBB', 'CCCCCC']) {
  let i = 0
  const pool = createCodePool({ generator: () => codes[i++]! })
  let u = 0
  const uuids = ['uuid-0', 'uuid-1', 'uuid-2']
  const store = createRoomStore(pool, {
    uuidGenerator: () => uuids[u++]!,
  })
  return { pool, store }
}

describe('room store', () => {
  it('createRoom mints a record with distinct uuid and code', () => {
    const { store } = freshStore()
    const a = store.createRoom()
    const b = store.createRoom()
    expect(a.uuid).not.toBe(b.uuid)
    expect(a.code).not.toBe(b.code)
    expect(store.roomCount).toBe(2)
  })

  it('records start with an empty invitesOutstanding set', () => {
    const { store } = freshStore()
    const record = store.createRoom()
    expect(record.invitesOutstanding.size).toBe(0)
  })

  it('getByCode / getByUuid resolve a live record', () => {
    const { store } = freshStore()
    const record = store.createRoom()
    expect(store.getByCode(record.code)).toBe(record)
    expect(store.getByUuid(record.uuid)).toBe(record)
  })

  it('getByCode / getByUuid return undefined for misses', () => {
    const { store } = freshStore()
    store.createRoom()
    expect(store.getByCode('MISSING')).toBeUndefined()
    expect(store.getByUuid('uuid-999')).toBeUndefined()
  })

  it('deleteRoom removes the record from both indexes and releases the code', () => {
    const { pool, store } = freshStore()
    const record = store.createRoom()
    expect(pool.activeCount).toBe(1)
    store.deleteRoom(record.uuid)
    expect(store.roomCount).toBe(0)
    expect(store.getByCode(record.code)).toBeUndefined()
    expect(store.getByUuid(record.uuid)).toBeUndefined()
    expect(pool.activeCount).toBe(0)
  })

  it('deleteRoom is a no-op for unknown uuids', () => {
    const { store } = freshStore()
    store.createRoom()
    store.deleteRoom('not-a-real-uuid')
    expect(store.roomCount).toBe(1)
  })

  it('createRoom initializes CRDT state and sweeper fields', () => {
    const { store } = freshStore()
    const record = store.createRoom()
    // The doc is a brand-new, empty Y.Doc — content-blind per ADR-0001.
    expect(record.doc).toBeDefined()
    expect(record.awareness).toBeDefined()
    expect(record.awareness.doc).toBe(record.doc)
    // No connections yet; `lastEmptyAt` is stamped so the TTL sweeper
    // starts the eviction countdown from birth if nobody ever joins.
    expect(record.connections).toBe(0)
    expect(record.lastEmptyAt).toBeTypeOf('number')
  })

  it('deleteRoom clears awareness state during teardown', () => {
    const { store } = freshStore()
    const record = store.createRoom()
    // Simulate a peer having published presence before eviction.
    record.awareness.setLocalState({ displayName: 'peer' })
    expect(record.awareness.getStates().size).toBeGreaterThan(0)
    const awareness = record.awareness
    store.deleteRoom(record.uuid)
    // `Awareness.destroy()` is what guards against the 30s refresh
    // interval keeping the event loop alive; the user-visible effect
    // is that the state map is empty post-destroy.
    expect(awareness.getStates().size).toBe(0)
  })

  it('listRooms enumerates all live records', () => {
    const { store } = freshStore()
    const a = store.createRoom()
    const b = store.createRoom()
    const uuids = store.listRooms().map((r) => r.uuid).sort()
    expect(uuids).toEqual([a.uuid, b.uuid].sort())
  })

  it('createRoom accepts an optional passwordHash', () => {
    const { store } = freshStore()
    const record = store.createRoom({ passwordHash: 'a'.repeat(64) })
    expect(record.passwordHash).toBe('a'.repeat(64))
  })

  it('createRoom without options leaves passwordHash undefined', () => {
    const { store } = freshStore()
    const record = store.createRoom()
    expect(record.passwordHash).toBeUndefined()
  })

  describe('setPasswordHash', () => {
    it('sets a password on an existing room', () => {
      const { store } = freshStore()
      const record = store.createRoom()
      const result = store.setPasswordHash(record.uuid, 'b'.repeat(64))
      expect(result).toBe(true)
      expect(record.passwordHash).toBe('b'.repeat(64))
    })

    it('removes a password when set to null', () => {
      const { store } = freshStore()
      const record = store.createRoom({ passwordHash: 'c'.repeat(64) })
      const result = store.setPasswordHash(record.uuid, null)
      expect(result).toBe(true)
      expect(record.passwordHash).toBeUndefined()
    })

    it('returns false for unknown UUID', () => {
      const { store } = freshStore()
      const result = store.setPasswordHash('unknown-uuid', 'd'.repeat(64))
      expect(result).toBe(false)
    })
  })

  describe('accessModeOf', () => {
    it('is "open" for a plain new record', () => {
      const { store } = freshStore()
      const record = store.createRoom()
      expect(accessModeOf(record)).toBe('open')
    })

    it('is "password" when passwordHash is set', () => {
      expect(
        accessModeOf({
          passwordHash: 'opaque-hash',
          invitesOutstanding: new Set(),
        }),
      ).toBe('password')
    })

    it('is "invite" when an invite is outstanding and no password', () => {
      expect(
        accessModeOf({
          invitesOutstanding: new Set(['tok-1']),
        }),
      ).toBe('invite')
    })

    it('prefers "password" over "invite" when both are set', () => {
      expect(
        accessModeOf({
          passwordHash: 'opaque-hash',
          invitesOutstanding: new Set(['tok-1']),
        }),
      ).toBe('password')
    })
  })
})
