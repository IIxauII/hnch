/**
 * HTTP + WS server for the hnch relay.
 *
 * Routes:
 *
 *   - `GET /health` — liveness probe.
 *   - `POST /rooms` — mints a room, returns `{ uuid, code }`
 *     (ADR-0008, ADR-0016).
 *   - `GET /rooms/:code` — resolves a code to a UUID and reports the
 *     room's access mode, per ADR-0016. Responds
 *     `404 { reason: 'unknown-room' }` if the code is not live.
 *   - `WS /ws/:uuid` — handed to the y-websocket-compatible handler
 *     (see `ws-connection.ts`) after the `upgrade` event. Carries
 *     `JoinCredentials` as URL query params per ADR-0016; in this
 *     commit the relay is in *permissive* mode (plan §2.4): any
 *     well-formed handshake with a known UUID is accepted. The
 *     handshake-shape gate and Phase-5 enforcement hook land next to
 *     the sync-provider wiring in later P3 commits.
 *
 * Pre-upgrade rejections close the raw socket with a minimal HTTP
 * response so the client sees a clean `4xx` rather than a mysterious
 * closed WS — the post-upgrade close-code table from ADR-0016 is only
 * meaningful once the socket has been handed to the WS protocol.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { normalizeRoomCode, type JoinRejectionReason } from '@hnch/shared'
import { accessModeOf, type AccessMode, type RoomRecord, type RoomStore } from './room-store.js'
import { setupWSConnection, type WsRoom } from './ws-connection.js'

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

/** Max bytes we'll read on a JSON body before giving up. */
const MAX_BODY_BYTES = 4 * 1024

/** Regex for `WS /ws/:uuid` (strict, path-only — query strings are
 *  parsed separately via `URL`). */
const WS_PATH_RE = /^\/ws\/([0-9a-fA-F-]{36})\/?$/

/**
 * Creates the relay's HTTP + WebSocket server. The returned server is
 * not yet listening; callers invoke `.listen(port, host?)` themselves.
 */
export function createRelayServer(deps: RelayServerDeps): Server {
  const httpServer = createServer((req, res) => {
    handleHttpRequest(req, res, deps).catch((err: unknown) => {
      console.error('relay: unhandled error', err)
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal-error' })
      } else {
        res.destroy()
      }
    })
  })

  // `noServer: true` hands upgrade wiring to our listener so we can
  // route based on pathname and authoritatively reject unknown UUIDs
  // before the protocol handshake completes.
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head, wss, deps)
  })

  // When the HTTP server closes, also stop accepting new upgrades and
  // close live sockets so tests can tear down cleanly.
  httpServer.on('close', () => {
    wss.close()
  })

  return httpServer
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  const url = req.url
  if (url === undefined) {
    sendJson(res, 400, { error: 'bad-request' })
    return
  }

  // Strip query string before routing. `/ws/:uuid` is handled by the
  // `upgrade` event, not by this HTTP router, so query params never
  // need to flow through here.
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

function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  deps: RelayServerDeps,
): void {
  const url = req.url ?? ''
  const host = req.headers.host ?? 'localhost'
  let parsed: URL
  try {
    parsed = new URL(url, `http://${host}`)
  } catch {
    denyUpgrade(socket, 400, 'Bad Request')
    return
  }

  const match = parsed.pathname.match(WS_PATH_RE)
  if (match === null) {
    denyUpgrade(socket, 404, 'Not Found')
    return
  }

  const uuid = match[1]!
  const record: RoomRecord | undefined = deps.roomStore.getByUuid(uuid)
  if (record === undefined) {
    // The resolve step may have succeeded earlier but the room's TTL
    // lapsed in the interval. ADR-0016 allows recovering via the
    // close-code table post-upgrade *or* by rejecting at the upgrade
    // itself — we prefer the HTTP 404 here so the client's sync
    // provider can tell the difference from a transient disconnect
    // without parsing a close code.
    denyUpgrade(socket, 404, 'Not Found')
    return
  }

  // Phase 3 is permissive: any caller with a well-formed UUID in the
  // path is accepted. Phase 5 adds `JoinCredentials` shape validation
  // (and Phase-5 enforcement) in this exact spot per ADR-0016.
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    const wsRoom: WsRoom = {
      doc: record.doc,
      awareness: record.awareness,
      onConnectionOpen(): void {
        record.connections += 1
        record.lastEmptyAt = undefined
      },
      onConnectionClose(): void {
        record.connections = Math.max(0, record.connections - 1)
        if (record.connections === 0) {
          record.lastEmptyAt = Date.now()
        }
      },
    }
    setupWSConnection(ws, wsRoom)
  })
}

function denyUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
  )
  socket.destroy()
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
