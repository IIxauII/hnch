/**
 * HTTP server for the hnch relay.
 *
 * This module is the routing spine of the relay. In this commit it
 * only serves `GET /health` — enough to prove the process is alive
 * and the test harness can talk to it. Subsequent commits grow:
 *
 *   - `POST /rooms` and `GET /rooms/:code` (relay room store +
 *     code/UUID minting) per ADR-0008 and ADR-0016.
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

/** Payload of a successful `GET /health` response. Shape is pinned here so tests share it. */
export interface HealthPayload {
  readonly status: 'ok'
}

/**
 * Creates the relay's HTTP server. The returned server is not yet
 * listening; callers invoke `.listen(port, host?)` themselves. This
 * keeps test and production paths symmetric and lets tests use port 0
 * to pick an ephemeral port.
 */
export function createRelayServer(): Server {
  return createServer((req, res) => {
    handleRequest(req, res)
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // `req.url` is always defined for incoming requests on a node http
  // server, but the type allows undefined; guard and 400 defensively.
  const url = req.url
  if (url === undefined) {
    sendJson(res, 400, { error: 'bad-request' })
    return
  }

  // Strip any query string before routing. None of the Phase 3
  // endpoints use path params that overlap this check — `/ws/:uuid`
  // is handled by the `upgrade` event, not by this HTTP router.
  const path = url.split('?', 1)[0] ?? url

  if (req.method === 'GET' && path === '/health') {
    const payload: HealthPayload = { status: 'ok' }
    sendJson(res, 200, payload)
    return
  }

  sendJson(res, 404, { error: 'not-found' })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}
