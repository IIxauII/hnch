/**
 * Integration tests for the relay HTTP server.
 *
 * Each test stands up the server on port 0 (ephemeral) so runs are
 * hermetic and parallelizable, and closes it in `afterEach` to keep
 * the event loop clean on exit.
 */

import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRelayServer } from './server.js'
import type { Server } from 'node:http'

describe('relay server', () => {
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    server = createRelayServer()
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

  it('GET /health returns 200 with { status: "ok" }', async () => {
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

  it('unknown route returns 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as unknown
    expect(body).toEqual({ error: 'not-found' })
  })

  it('query string is stripped before routing', async () => {
    const res = await fetch(`${baseUrl}/health?probe=1`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown
    expect(body).toEqual({ status: 'ok' })
  })
})
