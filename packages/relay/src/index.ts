/**
 * hnch relay entry point.
 *
 * Current state: scaffold. The real relay implementation lands in
 * follow-up commits, each preceded by any ADR touch-ups needed.
 * Planned wiring:
 *
 *   - y-websocket setup with content-blind forwarding (ADR-0001).
 *   - Join handshake with access-control token validation (ADR-0009).
 *   - Room UUID ↔ code lookup with retire/release on snapshot TTL
 *     (ADR-0008, ADR-0012).
 *   - In-memory snapshot store keyed by room UUID with 24h TTL
 *     (ADR-0012).
 *   - Host-election observability hints — relay does not drive the
 *     election but may want to surface "last-peer-disconnect" for
 *     debugging (ADR-0010).
 *
 * Each of those lands in its own commit with a preceding ADR touch-up
 * if implementation reveals a gap in the existing decision record.
 */

import { generateRoomCode } from '@hnch/shared'

function main(): void {
  const port = Number(process.env['PORT'] ?? 1234)
  console.log('hnch relay scaffold — not yet implemented')
  console.log(`would listen on port ${port}`)
  // Sanity check: the workspace dependency on @hnch/shared resolves.
  console.log(`@hnch/shared.generateRoomCode() -> ${generateRoomCode()}`)
}

main()
