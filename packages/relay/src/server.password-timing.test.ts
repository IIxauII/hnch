/**
 * Regression guard: password comparison must use timingSafeEqual,
 * never a plain string equality check.
 *
 * vi.mock is hoisted by vitest so the spy is in place before server.ts
 * loads its `timingSafeEqual` binding.
 */

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

// Hoist a spy that wraps the real timingSafeEqual. The factory runs
// before any module under test imports from node:crypto.
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  return {
    ...real,
    timingSafeEqual: vi.fn(real.timingSafeEqual),
  }
})

// Import crypto AFTER the mock declaration so we get the mocked version.
const crypto = await import('node:crypto')
const timingSafeEqualSpy = vi.mocked(crypto.timingSafeEqual)

import { createCodePool } from './code-pool.js'
import { createRoomStore, type RoomStore } from './room-store.js'
import { createRelayServer } from './server.js'
import { hashPassword } from '@hnch/shared'

describe('password-compare timing safety', () => {
  let server: Server
  let baseUrl: string
  let roomStore: RoomStore

  beforeEach(async () => {
    timingSafeEqualSpy.mockClear()
    roomStore = createRoomStore(createCodePool())
    server = createRelayServer({ roomStore })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('calls timingSafeEqual when a wrong password is submitted', async () => {
    const correctPw = await hashPassword('secret', 'room-uuid-1')
    const wrongPw = await hashPassword('wrong', 'room-uuid-1')
    const record = roomStore.createRoom({ passwordHash: correctPw })

    const wsUrl = baseUrl.replace('http', 'ws')
    const ws = new WebSocket(`${wsUrl}/ws/${record.uuid}?did=device-1&pw=${wrongPw}`)
    // Wrong-password now closes post-upgrade (4002); listen for close too.
    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve())
      ws.on('unexpected-response', () => resolve())
      ws.on('close', () => resolve())
    })

    expect(timingSafeEqualSpy).toHaveBeenCalled()
  })

  it('calls timingSafeEqual with two equal-length Buffer arguments', async () => {
    const correctPw = await hashPassword('secret', 'room-uuid-1')
    const wrongPw = await hashPassword('wrong', 'room-uuid-1')
    const record = roomStore.createRoom({ passwordHash: correctPw })

    const wsUrl = baseUrl.replace('http', 'ws')
    const ws = new WebSocket(`${wsUrl}/ws/${record.uuid}?did=device-1&pw=${wrongPw}`)
    // Wrong-password now closes post-upgrade (4002); listen for close too.
    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve())
      ws.on('unexpected-response', () => resolve())
      ws.on('close', () => resolve())
    })

    const [a, b] = timingSafeEqualSpy.mock.calls[0]!
    expect(Buffer.isBuffer(a)).toBe(true)
    expect(Buffer.isBuffer(b)).toBe(true)
    expect((a as Buffer).length).toBe((b as Buffer).length)
  })

  it('calls timingSafeEqual when correct password is submitted (accept path)', async () => {
    const pw = await hashPassword('secret', 'room-uuid-2')
    const record = roomStore.createRoom({ passwordHash: pw })

    const wsUrl = baseUrl.replace('http', 'ws')
    const ws = new WebSocket(`${wsUrl}/ws/${record.uuid}?did=device-1&pw=${pw}`)
    await new Promise<void>((resolve) => {
      ws.on('open', () => { ws.close(); resolve() })
      ws.on('error', () => resolve())
      ws.on('unexpected-response', () => resolve())
    })

    expect(timingSafeEqualSpy).toHaveBeenCalled()
  })
})
