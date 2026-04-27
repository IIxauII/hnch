/**
 * hnch relay entry point.
 *
 * Phase 3 scaffolding. This process is the content-blind y-websocket
 * relay described in ADR-0001; in this commit it only binds the HTTP
 * server and exposes `GET /health`. Later commits in the phase grow:
 *
 *   - Room store and code/UUID minting (ADR-0008).
 *   - Join handshake with `JoinCredentials` via URL query params
 *     (ADR-0009, ADR-0016).
 *   - y-websocket `setupWSConnection` handoff and the 24h in-memory
 *     snapshot TTL (ADR-0012).
 *   - Permissive access-control mode for Phase 3 (enforcement lands
 *     in Phase 5 without a wire-protocol revision).
 *
 * Host-election observability hints (ADR-0010) remain a future
 * addition only if debugging calls for it; election itself is
 * client-driven and does not require relay cooperation.
 */

import { createCodePool } from './code-pool.js'
import { createRoomStore } from './room-store.js'
import { createRelayServer, logBootBanner, ROOM_CAP, TEST_ROUTES_ENABLED } from './server.js'

const DEFAULT_PORT = 1234
const DEFAULT_HOST = '0.0.0.0'

function main(): void {
  const portEnv = process.env['PORT']
  const port = portEnv === undefined || portEnv === '' ? DEFAULT_PORT : Number(portEnv)
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    console.error(`invalid PORT: ${portEnv}`)
    process.exit(1)
  }

  const hostEnv = process.env['HOST']
  const host = hostEnv === undefined || hostEnv === '' ? DEFAULT_HOST : hostEnv

  const codePool = createCodePool()
  const roomStore = createRoomStore(codePool)
  const server = createRelayServer({ roomStore })
  server.listen(port, host, () => {
    const address = server.address()
    const boundPort = typeof address === 'object' && address !== null ? address.port : port
    const boundHost = typeof address === 'object' && address !== null ? address.address : host
    logBootBanner({
      port: boundPort,
      host: boundHost,
      roomCap: ROOM_CAP,
      testRoutesEnabled: TEST_ROUTES_ENABLED,
      logger: console,
    })
  })

  // Graceful shutdown so `pnpm dev`'s Ctrl-C in a tsx-watch loop
  // actually closes the socket instead of leaking handles.
  // server.close() only stops *new* connections — open WebSockets keep
  // the process alive indefinitely. Force-exit after a short grace
  // period so tsx-watch restarts don't hit EADDRINUSE.
  const shutdown = (): void => {
    server.close(() => {
      process.exit(0)
    })
    setTimeout(() => {
      process.exit(0)
    }, 500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
