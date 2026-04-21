/**
 * Unit tests for the TTL snapshot sweeper (ADR-0012).
 *
 * The sweeper is driven by wall-clock comparisons against each record's
 * `lastEmptyAt`, so every test threads an injected `now` instead of
 * racing `Date.now()`. Tests also pass `start: false` so the sweeper
 * never schedules its own interval — `sweep()` is called directly.
 */

import { describe, expect, it } from 'vitest'
import { createCodePool } from './code-pool.js'
import { createRoomStore } from './room-store.js'
import { createSnapshotSweeper, SNAPSHOT_TTL_MS } from './snapshot.js'

function freshStore() {
  return createRoomStore(createCodePool())
}

describe('snapshot sweeper', () => {
  it('keeps a room with live connections regardless of age', () => {
    const store = freshStore()
    const record = store.createRoom()
    record.connections = 1
    record.lastEmptyAt = undefined
    const clock = { now: 1_000_000 }
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 10,
      now: () => clock.now,
      start: false,
    })
    clock.now += 10 * SNAPSHOT_TTL_MS // far beyond TTL
    sweeper.sweep()
    expect(store.getByUuid(record.uuid)).toBe(record)
  })

  it('keeps an empty room until the TTL elapses', () => {
    const store = freshStore()
    const record = store.createRoom()
    const t0 = 1_000_000
    record.connections = 0
    record.lastEmptyAt = t0
    const clock = { now: t0 }
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 1_000,
      now: () => clock.now,
      start: false,
    })
    // Just under TTL — still alive.
    clock.now = t0 + 999
    sweeper.sweep()
    expect(store.getByUuid(record.uuid)).toBe(record)
    // Exactly at TTL boundary — evicted (cutoff is inclusive).
    clock.now = t0 + 1_000
    sweeper.sweep()
    expect(store.getByUuid(record.uuid)).toBeUndefined()
  })

  it('evicts an empty room past its TTL and releases the code', () => {
    const pool = createCodePool()
    const store = createRoomStore(pool)
    const record = store.createRoom()
    const t0 = 1_000_000
    record.connections = 0
    record.lastEmptyAt = t0
    const clock = { now: t0 + 2_000 }
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 1_000,
      now: () => clock.now,
      start: false,
    })
    expect(pool.activeCount).toBe(1)
    sweeper.sweep()
    expect(store.roomCount).toBe(0)
    expect(store.getByUuid(record.uuid)).toBeUndefined()
    expect(pool.activeCount).toBe(0)
  })

  it('ignores rooms whose lastEmptyAt is undefined', () => {
    const store = freshStore()
    const record = store.createRoom()
    // A room that has never been empty (e.g., just minted but a peer
    // is connecting) — the sweeper must not evict on that state.
    record.connections = 1
    record.lastEmptyAt = undefined
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 1,
      now: () => Number.MAX_SAFE_INTEGER,
      start: false,
    })
    sweeper.sweep()
    expect(store.getByUuid(record.uuid)).toBe(record)
  })

  it('evicts multiple rooms in a single pass without tripping iterators', () => {
    const store = freshStore()
    const a = store.createRoom()
    const b = store.createRoom()
    const c = store.createRoom()
    const t0 = 2_000_000
    a.connections = 0
    a.lastEmptyAt = t0
    b.connections = 1
    b.lastEmptyAt = undefined
    c.connections = 0
    c.lastEmptyAt = t0
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 1_000,
      now: () => t0 + 5_000,
      start: false,
    })
    sweeper.sweep()
    expect(store.getByUuid(a.uuid)).toBeUndefined()
    expect(store.getByUuid(b.uuid)).toBe(b)
    expect(store.getByUuid(c.uuid)).toBeUndefined()
  })

  it('stop() clears the scheduled interval when one was started', () => {
    const store = freshStore()
    // With `start: true` the sweeper registers a setInterval; we just
    // need `stop()` not to throw and to make subsequent stop() idempotent.
    const sweeper = createSnapshotSweeper(store, {
      ttlMs: 1_000,
      intervalMs: 60_000,
      start: true,
    })
    sweeper.stop()
    sweeper.stop()
  })

  it('defaults the TTL to 24h per ADR-0012', () => {
    expect(SNAPSHOT_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })
})
