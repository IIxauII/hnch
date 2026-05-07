# ADR-0025: Reconnect / backoff posture — y-websocket defaults plus `online` reset

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Client connects to relay over WebSocket via `y-websocket` ([ADR-0001](0001-networking-crdt-over-relay.md), [ADR-0003](0003-state-sync-yjs.md)).
- Drops happen: bad Wi-Fi, sleep/wake, network change, relay restart. Must reconnect + resume sync.
- y-websocket already ships truncated exponential backoff (30 s ceiling).
- Chromium quirk: in offline mode the OS reports network up before the existing socket tears down. y-websocket's `connect()` no-ops when `ws !== null` → reconnect never fires. Observed in DevTools Offline + real-world Wi-Fi roams. Failure mode: socket "connected", no messages flow, frozen session.
- Without ADR, `online`-handler workaround at `packages/client/src/app/core/doc/sync-provider.ts:209-224` looks like a bug a future contributor will rip out.

## Decision

Use y-websocket's default reconnect logic unmodified. Add one `window` `online` handler that resets `wsUnsuccessfulReconnects = 0` then closes stale `provider.ws` (or calls `connect()` if null) so backoff restarts at 100 ms. Honor `manuallyDisconnected()` guard. CLI ([ADR-0021](0021-cli-package.md)) skips the handler — no `window`, no Chromium runtime.

## Options

- **A — y-websocket defaults + `online` reset (chosen):** ~15 lines glue. Pros: covers transient drops + Chromium quirk; targeted; no parallel state. Cons: code looks weird without ADR/comment context.
- **B — Custom backoff wrapper:** Pros: full control over jitter/timing. Cons: second source of truth for connection state; will diverge from library; unjustified for one quirk.
- **C — Drop the `online` reset:** Pros: zero glue. Cons: silent frozen-session bug returns; UI shows green while no messages flow.
- **D — Replace y-websocket entirely:** Pros: total control. Cons: discards working sync-step-1/2 + awareness + battle-testing; non-decision.

## Trade-offs

- Coupled to y-websocket internal field `wsUnsuccessfulReconnects` — rename = one-line fix.
- Reset-counter-before-close order matters: closing first would schedule next attempt with accumulated backoff seconds; reset first → 100 ms (matches user intent on `online`).
- Healthy browsers pay one no-op `online` listener per session — negligible.

## Consequences

- Easier: transient drops, sleep/wake, server restart, network roam all "just work"; future y-websocket fixes flow through automatically.
- Harder: `online`-reset path non-obvious; relies on inline comment + this ADR.
- Reconnect-after-snapshot-eviction inherits from [ADR-0012](0012-snapshot-policy.md) + [ADR-0022](0022-last-session-cache.md): `4001 / unknown-room` → cache clear → "session expired".
- No retry-storm protection — [ADR-0024](0024-participant-cap.md) cap of 20 + event-loop variance suffices.
- Revisit when: y-websocket fixes the `ws !== null` no-op upstream; second distinct failure mode appears (default to another targeted reset until two accumulate); cap grows to 50+ (add jitter); replace y-websocket for unrelated reasons.

## Action Items

- [ ] Add regression test: provider in disconnected state with non-null `ws` and `wsUnsuccessfulReconnects > 0`, dispatch `online`, assert reset + close.
- [ ] Verify inline comment at `sync-provider.ts:209-224` references this ADR.
