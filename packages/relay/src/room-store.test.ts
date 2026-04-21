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

  describe('accessModeOf', () => {
    it('is "open" for a plain new record', () => {
      const { store } = freshStore()
      const record = store.createRoom()
      expect(accessModeOf(record)).toBe('open')
    })

    it('is "password" when passwordHash is set', () => {
      expect(
        accessModeOf({
          uuid: 'u',
          code: 'C',
          passwordHash: 'opaque-hash',
          invitesOutstanding: new Set(),
        }),
      ).toBe('password')
    })

    it('is "invite" when an invite is outstanding and no password', () => {
      expect(
        accessModeOf({
          uuid: 'u',
          code: 'C',
          invitesOutstanding: new Set(['tok-1']),
        }),
      ).toBe('invite')
    })

    it('prefers "password" over "invite" when both are set', () => {
      expect(
        accessModeOf({
          uuid: 'u',
          code: 'C',
          passwordHash: 'opaque-hash',
          invitesOutstanding: new Set(['tok-1']),
        }),
      ).toBe('password')
    })
  })
})
