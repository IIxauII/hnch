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

import { createRelayServer } from './server.js'

const DEFAULT_PORT = 1234

function main(): void {
  const portEnv = process.env['PORT']
  const port = portEnv === undefined || portEnv === '' ? DEFAULT_PORT : Number(portEnv)
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    console.error(`invalid PORT: ${portEnv}`)
    process.exit(1)
  }

  const server = createRelayServer()
  server.listen(port, () => {
    const address = server.address()
    const boundPort = typeof address === 'object' && address !== null ? address.port : port
    console.log(`hnch relay listening on :${boundPort}`)
  })

  // Graceful shutdown so `pnpm dev`'s Ctrl-C in a tsx-watch loop
  // actually closes the socket instead of leaking handles.
  const shutdown = (): void => {
    server.close(() => {
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
