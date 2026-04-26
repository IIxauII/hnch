/**
 * Tests for the DELETE /test/rooms/:uuid endpoint.
 *
 * Uses a dynamic import so HNCH_ENABLE_TEST_ROUTES is set before server.ts
 * evaluates its module-level TEST_ROUTES_ENABLED constant. Each test file
 * runs in its own vitest worker, so the module cache is fresh here.
 */

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCodePool } from './code-pool.js'
import { createRoomStore, type RoomStore } from './room-store.js'
import type { CreateRoomResponse, RelayServerDeps } from './server.js'

// Set before the dynamic import below so server.ts sees the flag at eval time.
process.env['HNCH_ENABLE_TEST_ROUTES'] = '1'

let createRelayServer: (deps: RelayServerDeps) => Server

beforeAll(async () => {
  const mod = (await import('./server.js')) as { createRelayServer: (deps: RelayServerDeps) => Server }
  createRelayServer = mod.createRelayServer
})

describe('DELETE /test/rooms/:uuid (HNCH_ENABLE_TEST_ROUTES=1)', () => {
  let server: Server
  let baseUrl: string
  let roomStore: RoomStore

  beforeEach(async () => {
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
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('returns 400 for a malformed UUID', async () => {
    const res = await fetch(`${baseUrl}/test/rooms/not-a-uuid`, { method: 'DELETE' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as unknown
    expect(body).toEqual({ error: 'bad-uuid' })
  })

  it('returns 404 for an unknown UUID', async () => {
    const uuid = '00000000-0000-0000-0000-000000000000'
    const res = await fetch(`${baseUrl}/test/rooms/${uuid}`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = (await res.json()) as unknown
    expect(body).toEqual({ error: 'not-found' })
  })

  it('evicts a known room and returns 200 { evicted: uuid }', async () => {
    const createRes = await fetch(`${baseUrl}/rooms`, { method: 'POST' })
    expect(createRes.status).toBe(201)
    const { uuid, code } = (await createRes.json()) as CreateRoomResponse

    const deleteRes = await fetch(`${baseUrl}/test/rooms/${uuid}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)
    const body = (await deleteRes.json()) as unknown
    expect(body).toEqual({ evicted: uuid })

    // Room is gone — GET /rooms/:code should return 404.
    const resolveRes = await fetch(`${baseUrl}/rooms/${code}`)
    expect(resolveRes.status).toBe(404)
  })

  it('subsequent DELETE on evicted room returns 404', async () => {
    const createRes = await fetch(`${baseUrl}/rooms`, { method: 'POST' })
    const { uuid } = (await createRes.json()) as CreateRoomResponse

    await fetch(`${baseUrl}/test/rooms/${uuid}`, { method: 'DELETE' })
    const second = await fetch(`${baseUrl}/test/rooms/${uuid}`, { method: 'DELETE' })
    expect(second.status).toBe(404)
  })
})
