/**
 * Integration tests for the relay HTTP server.
 *
 * Each test stands up the server on port 0 (ephemeral) so runs are
 * hermetic and parallelizable, and closes it in `afterEach` to keep
 * the event loop clean on exit.
 */

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCodePool } from './code-pool.js'
import { createRoomStore, type RoomStore } from './room-store.js'
import {
  createRelayServer,
  type CreateRoomResponse,
  type ResolveRoomRejection,
  type ResolveRoomResponse,
} from './server.js'

describe('relay server', () => {
  let server: Server
  let baseUrl: string
  let roomStore: RoomStore

  beforeEach(async () => {
    roomStore = createRoomStore(createCodePool())
    server = createRelayServer({ roomStore })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
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

  describe('GET /health', () => {
    it('returns 200 with { status: "ok" }', async () => {
      const res = await fetch(`${baseUrl}/health`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      const body = (await res.json()) as unknown
      expect(body).toEqual({ status: 'ok' })
    })

    it('POST /health returns 404 (method narrowing)', async () => {
      const res = await fetch(`${baseUrl}/health`, { method: 'POST' })
      expect(res.status).toBe(404)
    })

    it('query string is stripped before routing', async () => {
      const res = await fetch(`${baseUrl}/health?probe=1`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as unknown
      expect(body).toEqual({ status: 'ok' })
    })
  })

  describe('POST /rooms', () => {
    it('mints a room and returns its uuid + code', async () => {
      const res = await fetch(`${baseUrl}/rooms`, { method: 'POST' })
      expect(res.status).toBe(201)
      const body = (await res.json()) as CreateRoomResponse
      expect(typeof body.uuid).toBe('string')
      expect(body.uuid.length).toBeGreaterThan(0)
      // ADR-0008 alphabet: A-Z minus O/I/L, digits 2-9.
      expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
      expect(roomStore.roomCount).toBe(1)
      expect(roomStore.getByUuid(body.uuid)?.code).toBe(body.code)
    })

    it('accepts an empty JSON body', async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      expect(res.status).toBe(201)
    })

    it('rejects a malformed body with 400', async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not valid json',
      })
      expect(res.status).toBe(400)
      expect(roomStore.roomCount).toBe(0)
    })

    it('consecutive calls mint distinct rooms', async () => {
      const a = await (await fetch(`${baseUrl}/rooms`, { method: 'POST' })).json() as CreateRoomResponse
      const b = await (await fetch(`${baseUrl}/rooms`, { method: 'POST' })).json() as CreateRoomResponse
      expect(a.uuid).not.toBe(b.uuid)
      expect(a.code).not.toBe(b.code)
      expect(roomStore.roomCount).toBe(2)
    })
  })

  describe('GET /rooms/:code', () => {
    it('resolves a live code to { uuid, accessMode: "open" }', async () => {
      const record = roomStore.createRoom()
      const res = await fetch(`${baseUrl}/rooms/${record.code}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as ResolveRoomResponse
      expect(body).toEqual({ uuid: record.uuid, accessMode: 'open' })
    })

    it('normalizes lowercase and dashed input', async () => {
      const record = roomStore.createRoom()
      const dashed = `${record.code.slice(0, 3)}-${record.code.slice(3)}`.toLowerCase()
      const res = await fetch(`${baseUrl}/rooms/${encodeURIComponent(dashed)}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as ResolveRoomResponse
      expect(body.uuid).toBe(record.uuid)
    })

    it('returns 404 with { reason: "unknown-room" } for an unknown code', async () => {
      const res = await fetch(`${baseUrl}/rooms/ZZZZZZ`)
      expect(res.status).toBe(404)
      const body = (await res.json()) as ResolveRoomRejection
      expect(body).toEqual({ reason: 'unknown-room' })
    })

    it('returns 404 after the room is deleted', async () => {
      const record = roomStore.createRoom()
      roomStore.deleteRoom(record.uuid)
      const res = await fetch(`${baseUrl}/rooms/${record.code}`)
      expect(res.status).toBe(404)
    })
  })

  describe('unknown routes', () => {
    it('return 404 JSON', async () => {
      const res = await fetch(`${baseUrl}/does-not-exist`)
      expect(res.status).toBe(404)
      const body = (await res.json()) as unknown
      expect(body).toEqual({ error: 'not-found' })
    })
  })
})
