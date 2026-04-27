# ADR-0025: Reconnect / backoff posture — y-websocket defaults plus `online` reset

**Status:** Proposed
**Date:** 2026-04-26
**Deciders:** Xau

## Context

The client connects to the relay over a WebSocket via [`y-websocket`](https://github.com/yjs/y-websocket) ([ADR-0001](0001-networking-crdt-over-relay.md), [ADR-0003](0003-state-sync-yjs.md)). When the connection drops — bad Wi-Fi, sleep/wake, network change, the relay restarting — the client must reconnect and resume sync. y-websocket already ships a reconnect implementation (truncated exponential backoff with a 30-second ceiling, capped successive failures, no manual restart logic required from us). The structural question is whether to use that as-is, replace it, or wrap it.

In practice we use the default *plus* one explicit `window` `online`-event handler. That handler (`packages/client/src/app/core/doc/sync-provider.ts:209-224`) was debugged into existence to work around a Chromium quirk: in offline mode (DevTools "Offline" toggle, and observed in real-world flaky-Wi-Fi transitions) the OS reports the network as up before Chromium tears down the existing socket. y-websocket's `connect()` is a no-op when its `ws` field is non-null, so a stale-but-still-open socket prevents reconnection. The fix is to (a) reset y-websocket's internal `wsUnsuccessfulReconnects` counter so backoff starts at 100 ms instead of seconds-from-prior-failures, and (b) force-close the stale socket so the library's own `onclose` handler fires and schedules the next attempt.

Without an ADR, this code looks weird. A future contributor will read "we close a connected-looking socket on the `online` event" and assume it's a bug. They will rip it out, the bug will return, and they will rediscover it through the same tedious browser-DevTools session that produced the workaround in the first place. This ADR pins the decision (lean on y-websocket; don't write our own retry layer) and the workaround (the `online`-reset) so that doesn't happen.

> **Note for readers landing here from [ADR-0024](0024-participant-cap.md):** [ADR-0024](0024-participant-cap.md) previously had a stale forward-reference to "ADR-0025 (test-only relay surfaces)" that pre-dated this ADR's number assignment. The reference was corrected in a typo-class fix to point at [ADR-0027](0027-test-only-relay-surfaces.md) (test-only relay surfaces) once that ADR landed. This note remains as a historical record so readers tracking the audit trail know why an "ADR-0025" forward-reference once meant something other than this reconnect / backoff posture.

## Decision

1. **Lean on y-websocket's default reconnect logic.** No custom backoff schedule, no custom reconnection state machine, no library override. The defaults — exponential backoff capped at ~30 seconds, automatic reconnect on socket close, awareness/sync-step retransmission on reconnect — are the contract the relay is built against and they cover the realistic disconnect cases (transient drop, server restart, cross-network roam) without us writing replay logic.

2. **Add an explicit `window` `online`-event handler that forces a reconnect.** When the browser fires `online` and y-websocket reports anything other than `connected`, we:
   - Reset `provider.wsUnsuccessfulReconnects = 0` so the backoff starts at 100 ms.
   - If `provider.ws !== null`, call `provider.ws.close()` to make the library's `onclose` handler fire and schedule `setupWS`.
   - Otherwise (`provider.ws === null`) call `provider.connect()` directly — y-websocket would no-op the close-then-reconnect path in this case.

   The handler is registered alongside an `offline` handler that flips our local `status` signal to `disconnected`, so the UI reflects reality without waiting for y-websocket to time out. Both handlers respect a `manuallyDisconnected()` guard so user-initiated leaves don't get clobbered by network events.

3. **The Chromium quirk is the *reason*; the workaround is the *what*.** Do not remove the `online`-reset without first reproducing the original symptom (Chromium DevTools → Network → Offline mode, observe that the socket appears `connected` to JavaScript while no messages flow, then toggle online and verify the socket auto-recovers without the workaround). The workaround is targeted — it does nothing on Firefox/Safari unless they're also affected, because in the healthy case `provider.ws !== null && status() === 'connected'` and the handler returns early.

   **Scope:** this `online`-reset workaround applies to the browser / Capacitor runtime only. The CLI uses y-websocket with the same defaults but does not register `window` event handlers (none exist in a Node TTY runtime); the Chromium offline-mode quirk that motivates the workaround is browser-specific. This is an environmental divergence analogous to [ADR-0021](0021-cli-package.md) §3 and §4 (CLI identity / persistence divergences from [ADR-0005](0005-device-identity-capacitor-device-plugin.md) and [ADR-0004](0004-local-persistence-sqlite-indexeddb.md)), not a parity-contract violation. Decision §5 below restates this in formal terms; this scope note is for readers landing on §2 / §3 first.

4. **No custom retry layer.** A "wrapper" reconnect implementation that owns its own backoff, queue, or replay buffer is out of scope. y-websocket's defaults already work with the relay's snapshot policy ([ADR-0012](0012-snapshot-policy.md)) — sync-step-1/2 on reconnect runs against the relay-side `Y.Doc`, the snapshot is delivered as a normal sync exchange, and the awareness state is rehydrated on the next tick. Wrapping that would either reimplement what we already have or sit as a lossy second source of truth for connection state.

5. **CLI behavior — y-websocket defaults apply unmodified.** The CLI ([ADR-0021](0021-cli-package.md)) has no `window`, no DOM `online` / `offline` events, and no Chromium runtime, so the workaround in §2 is irrelevant. Reconnect there is purely y-websocket's default backoff; the CLI does not register OS-level network-change listeners and does not need to. The lack of the workaround is a correct platform divergence, not a parity gap with the mobile client.

6. **Reconnect-meets-snapshot — flow inherits from existing ADRs, not redefined here.** A reconnect that succeeds within the [ADR-0012](0012-snapshot-policy.md) 24-hour snapshot TTL gets the snapshot via y-websocket's standard sync-step-1/2 against the relay-side `Y.Doc`. A reconnect that arrives after the snapshot has been evicted (or after the room code was retired per [ADR-0008](0008-room-code-format.md)) gets `4001 / unknown-room` from the [ADR-0016](0016-client-relay-connection-handshake.md) handshake and falls into the [ADR-0022](0022-last-session-cache.md) cache-clear / "session expired" path. Same shape for both runtimes; same shape whether the disconnect was sub-second or overnight. The snapshot TTL is the authoritative arbiter — there is no client-side time-since-last-connect logic that would need to agree with the server.

7. **No retry-storm protection at v1 scale.** With the [ADR-0024](0024-participant-cap.md) cap of 20 peers per room, a relay restart triggers at most 20 simultaneous reconnect attempts per room. y-websocket's default backoff already starts at a sub-second value and the per-client variance from event-loop scheduling is enough to spread thundering-herd reconnect attempts across a window that doesn't materially load a v1 relay. Explicit jitter is unnecessary now and is recorded as a revisit trigger if the cap ever grows materially.

8. **Connection-state UX — surfaced, never gives up.**
   - **Mobile / PWA:** the local `status` signal flips between `connected`, `disconnected`, and `connecting` states; a connection-state indicator (per [`ux.md`](../ux.md)) shows "Reconnecting…" during retry attempts so the user is not left wondering why the doc looks frozen.
   - **CLI:** retry status is printed to `stderr` so it does not interleave with structured output.
   - **Neither client gives up.** y-websocket retries indefinitely; we do not impose a "tried N times, surfacing fatal error" cap. The user's tool to break out is explicit (close the app, run `hnch` again) rather than implicit (timeout). This matches the meeting-cadence assumption — a 30-second outage during sprint planning should not eject the user.

## Options Considered

### Option A: y-websocket defaults plus `online`-event reset (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — ~15 lines of glue |
| Coverage | Covers the realistic cases plus the Chromium quirk |
| Risk | Low — deviates from defaults only where defaults are observably wrong |
| Team familiarity | High — y-websocket is the existing dependency |

**Pros:** every transient disconnect that y-websocket already handles continues to work without us thinking about it. The one observed failure mode (Chromium offline-mode socket persistence) is fixed with a targeted reset that no-ops in the healthy case. No new state to keep coherent with the rest of the sync provider.
**Cons:** the `online`-reset looks odd at first read — closing a connected-looking socket on the `online` event is counter-intuitive without the Chromium context. Mitigated by the inline comment plus this ADR.

### Option B: Custom backoff layer wrapping y-websocket

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Coverage | Same realistic-cases coverage, plus whatever we hand-write |
| Risk | Medium — second source of truth for connection state |
| Team familiarity | Standard but unnecessary |

**Pros:** full control over backoff timing, jitter, tunable per-environment.
**Cons:** y-websocket is already doing this and is already what the relay is tested against. Building a parallel layer means two pieces of code agree on "are we connected", "how long do we wait", "are we replaying" — and they will eventually disagree. None of the operational pain we have today suggests we need control over those knobs; we have one Chromium quirk and the targeted fix is twelve lines.

### Option C: Drop the `online`-reset and accept the Chromium offline-mode bug

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Coverage | Misses one observed failure mode |
| Risk | Low — the bug is silent (no errors, just stuck) |
| Team familiarity | High |

**Pros:** zero glue code; nothing to explain.
**Cons:** the bug *is* observable in production (it surfaced during real-world Wi-Fi roams, not just the DevTools toggle), and the failure mode is the worst kind: the socket is "connected" so the UI shows green, but no messages flow. Users see a frozen session that recovers only on manual refresh. The cost of the workaround is a dozen lines and one ADR; the cost of the bug is silent staleness.

### Option D: Replace y-websocket with a hand-rolled WS layer

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Coverage | Whatever we re-implement |
| Risk | High — re-implementing a working library |
| Team familiarity | Low |

**Pros:** total control. Could integrate reconnect with our own status signaling natively.
**Cons:** [ADR-0003](0003-state-sync-yjs.md) chose Yjs and y-websocket as a paired stack precisely so we don't write this layer. Replacing it for one reconnect quirk would discard a working implementation along with its sync-step-1/2 protocol, awareness handling, and battle-testing. A non-decision in the strongest sense.

## Trade-off Analysis

Option A is the obviously right answer once the Chromium quirk is treated as the *reason* for code rather than the *whole story*. y-websocket's defaults cover ~99% of disconnect cases; the `online`-reset covers the 1% that the defaults miss in a specific browser; nothing else needs custom code. The honest cost — a chunk of code that looks weird without context — is paid by writing this ADR and keeping the inline comment. The benefit is that the next contributor opens this ADR before reaching for the delete key.

The decision *not* to write a wrapper layer is structural. y-websocket is the existing dependency; the relay is built and tested against y-websocket's wire behavior; our doc is bound directly to the y-websocket provider. Wrapping it would either duplicate logic (Option B) or replace a working library (Option D). Neither is justified by one targeted browser quirk.

The `online`-reset's design is also worth pinning: we reset `wsUnsuccessfulReconnects` *before* closing the socket. The order matters. If we closed first, the library's `onclose` would schedule the next attempt using whatever backoff was already accumulated — potentially seconds — when the user just signaled "I'm back online, do the thing now". Resetting first ensures the backoff is 100 ms, which lines up with user intent.

## Consequences

**Easier:**
- Reconnects on transient drops, sleep/wake cycles, server restarts, and network changes "just work" because y-websocket already handles them and we haven't shadowed that logic.
- The Chromium offline-mode failure mode no longer manifests as a frozen session; the `online`-reset turns it into a sub-second recovery that the user perceives as a normal reconnect.
- A future protocol change in y-websocket's reconnect logic flows through automatically; we have no parallel implementation to keep in sync.

**Harder:**
- The `online`-reset code path is non-obvious. Anyone reading it cold will need either the inline comment or this ADR to understand why we close a connected-looking socket. We accept this — the alternative is the bug returning.
- We are coupled to y-websocket's internal field name `wsUnsuccessfulReconnects`. A breaking rename in y-websocket would require updating our handler. Acceptable: it's one line of glue, and y-websocket's API surface is small.
- Browsers other than Chromium that don't have this quirk pay no cost (the handler returns early when the socket is healthy), but we're still registering a global `online` listener on every session. The cost is negligible — one event listener per active session.

**Revisit triggers:**
- y-websocket fixes the no-op-when-`ws !== null` behavior or the Chromium quirk is fixed upstream → the `online`-reset can be removed; verify by running the original Chromium DevTools repro.
- A second, distinct reconnect failure mode appears that the current handler doesn't cover → consider whether it's another targeted reset or a sign that Option B (wrapper layer) is now justified. Default to "another targeted reset" until two such workarounds accumulate.
- We replace y-websocket for unrelated reasons (e.g., a different sync library, different transport) → this ADR is automatically obsolete and a successor would record the new layer's reconnect posture.
- The [ADR-0024](0024-participant-cap.md) cap grows materially (e.g., to 50+) → re-evaluate retry-storm protection on relay restart and add explicit reconnect jitter if measured load justifies it. Not a wire-protocol change; a successor ADR isn't strictly required, but record the rationale where this one lives.
- Performance pressure on the `online` event (e.g., we end up with many registered listeners across sessions) → consolidate to a single app-level handler that fan-outs. Currently a non-issue because we have one active session at a time per client.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner on the reconnect posture (default y-websocket plus `online` reset).
- [ ] Cross-link from [ADR-0001](0001-networking-crdt-over-relay.md) (typo-class addition) at the relay-architecture context noting that reconnect posture is recorded here.
- [ ] Cross-link from [ADR-0003](0003-state-sync-yjs.md) (typo-class addition) noting that the Yjs-via-y-websocket choice's reconnect implications are settled by this ADR.
- [ ] Verify the inline comment at `packages/client/src/app/core/doc/sync-provider.ts:209-224` references this ADR (currently references the Chromium quirk inline). Add a one-line "see ADR-0025" pointer if not already present so a contributor reading the source can find this document.
- [ ] Add a regression test that exercises the `online`-reset path: create a sync provider in disconnected state with a non-null `provider.ws` and accumulated `wsUnsuccessfulReconnects > 0`, dispatch a `window` `online` event, assert that the counter is reset and the socket is closed. Goal: catch a future sync-provider refactor that drops the workaround.
- [ ] Confirm [`ux.md`](../ux.md) describes the visible "Reconnecting…" indicator on the mobile client, and that [`cli.md`](../cli.md) describes the CLI's `stderr` retry status messages. If either is silent on the topic, file a doc-update follow-up rather than amending this ADR.
- [ ] Cross-link from [ADR-0022](0022-last-session-cache.md) (typo-class addition) noting that reconnect-after-snapshot-eviction is governed jointly by this ADR and the cache-clear path there.
- [x] **Forward-reference correction:** [ADR-0024](0024-participant-cap.md) §4 and revisit triggers previously referenced "ADR-0025 (test-only relay surfaces)" — that forward-reference collided with this ADR's number. The test-only-relay-surfaces ADR landed as [ADR-0027](0027-test-only-relay-surfaces.md), and ADR-0024's references were corrected in a typo-class fix.
