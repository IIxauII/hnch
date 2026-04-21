/**
 * HTTP server for the hnch relay.
 *
 * This module is the routing spine of the relay. Current routes:
 *
 *   - `GET /health` — liveness probe.
 *   - `POST /rooms` — mints a room, returns `{ uuid, code }`
 *     (ADR-0008, ADR-0016).
 *   - `GET /rooms/:code` — resolves a code to a UUID and reports the
 *     room's access mode, per ADR-0016. Responds `404 { reason:
 *     'unknown-room' }` if the code is not live.
 *
 * Coming in subsequent Phase 3 commits:
 *
 *   - `upgrade` → `WS /ws/:uuid` handoff to the y-websocket helper
 *     per ADR-0001 and ADR-0016, with the 24h in-memory snapshot
 *     lifecycle per ADR-0012.
 *   - Pre-upgrade shape validation of `JoinCredentials`, returning
 *     HTTP 400 with `reason: 'malformed-credentials'` for fail-fast
 *     per ADR-0016.
 *
 * The server is exposed as a factory so tests can stand an instance
 * up on an ephemeral port and tear it down cleanly.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { normalizeRoomCode, type JoinRejectionReason } from '@hnch/shared'
import { accessModeOf, type AccessMode, type RoomStore } from './room-store.js'

/** Payload of a successful `GET /health` response. */
export interface HealthPayload {
  readonly status: 'ok'
}

/** Payload of a successful `POST /rooms` response. */
export interface CreateRoomResponse {
  readonly uuid: string
  readonly code: string
}

/** Payload of a successful `GET /rooms/:code` response (ADR-0016). */
export interface ResolveRoomResponse {
  readonly uuid: string
  readonly accessMode: AccessMode
}

/** Payload of a `GET /rooms/:code` miss (ADR-0016). */
export interface ResolveRoomRejection {
  readonly reason: Extract<JoinRejectionReason, 'unknown-room'>
}

export interface RelayServerDeps {
  readonly roomStore: RoomStore
}

/** Max bytes we'll read on a JSON body before giving up. The relay's
 *  request bodies are all empty objects or small credential blobs, so
 *  anything larger is either misconfiguration or abuse. */
const MAX_BODY_BYTES = 4 * 1024

/**
 * Creates the relay's HTTP server. The returned server is not yet
 * listening; callers invoke `.listen(port, host?)` themselves. This
 * keeps test and production paths symmetric and lets tests use port 0
 * to pick an ephemeral port.
 */
export function createRelayServer(deps: RelayServerDeps): Server {
  return createServer((req, res) => {
    handleRequest(req, res, deps).catch((err: unknown) => {
      // Last-ditch catch — individual handlers should already have
      // responded. This only fires on truly unexpected failures.
      console.error('relay: unhandled error', err)
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal-error' })
      } else {
        res.destroy()
      }
    })
  })
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  // `req.url` is always defined for incoming requests on a node http
  // server, but the type allows undefined; guard and 400 defensively.
  const url = req.url
  if (url === undefined) {
    sendJson(res, 400, { error: 'bad-request' })
    return
  }

  // Strip any query string before routing. `/ws/:uuid` is handled by
  // the `upgrade` event, not by this HTTP router, so we never need to
  // inspect query params on the request path.
  const path = url.split('?', 1)[0] ?? url

  if (req.method === 'GET' && path === '/health') {
    const payload: HealthPayload = { status: 'ok' }
    sendJson(res, 200, payload)
    return
  }

  if (req.method === 'POST' && path === '/rooms') {
    await handleCreateRoom(req, res, deps)
    return
  }

  const roomCodeMatch = path.match(/^\/rooms\/([^/]+)\/?$/)
  if (req.method === 'GET' && roomCodeMatch !== null) {
    // The capture group is guaranteed non-empty by the regex. The
    // `!` is safe under `noUncheckedIndexedAccess` because match()
    // populates the group on a successful match.
    const raw = decodeURIComponent(roomCodeMatch[1]!)
    handleResolveRoom(raw, res, deps)
    return
  }

  sendJson(res, 404, { error: 'not-found' })
}

async function handleCreateRoom(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  // Phase 3 accepts an empty body or `{}`. Phase 5 will parse
  // `{ passwordHash?, inviteTokens? }` from the same endpoint.
  try {
    const body = await readJsonBody(req)
    if (body !== null && typeof body !== 'object') {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
  } catch {
    sendJson(res, 400, { error: 'bad-request' })
    return
  }

  const record = deps.roomStore.createRoom()
  const payload: CreateRoomResponse = {
    uuid: record.uuid,
    code: record.code,
  }
  sendJson(res, 201, payload)
}

function handleResolveRoom(
  rawCode: string,
  res: ServerResponse,
  deps: RelayServerDeps,
): void {
  // Tolerate lowercase and dash-separated inputs — the ADR-0008 helper
  // handles both. Rejection for an unknown code is 404 per ADR-0016.
  const normalized = normalizeRoomCode(rawCode)
  const record = deps.roomStore.getByCode(normalized)
  if (record === undefined) {
    const rejection: ResolveRoomRejection = { reason: 'unknown-room' }
    sendJson(res, 404, rejection)
    return
  }
  const payload: ResolveRoomResponse = {
    uuid: record.uuid,
    accessMode: accessModeOf(record),
  }
  sendJson(res, 200, payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('body too large')
    }
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf-8').trim()
  if (text === '') return {}
  return JSON.parse(text) as unknown
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}
