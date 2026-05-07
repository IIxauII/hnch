# ADR-0023: Session-end-for-everyone — host-written doc broadcast

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Sessions ephemeral (ADR-0006) but no explicit "end" pre-v1; sessions died by attrition + 24h snapshot expiry (ADR-0012) + code retirement (ADR-0008).
- "We're done, drop everyone" / "scrap this room" use cases left stragglers in lobby.
- Shipped mechanism: host writes `meta.sessionEndedAt` (Unix ms) to Yjs doc; clients observe, toast, navigate Home.
- Same outcome reachable several ways with different failure modes — must pin choice + interactions with ADR-0010 (host election) + ADR-0012 (snapshot lifecycle).

## Decision

1. **Mechanism:** host calls `endSessionForEveryone(doc)` → sets `meta.sessionEndedAt = Date.now()` in single transaction. Field additive + optional; absent = active. Doc is the channel; reuses existing delivery; snapshot delivers to returning peers free; relay zero-impact; CRDT idempotency.
2. **Observers:** every client MUST observe `meta.sessionEndedAt`. Mobile = `SessionEndService`; CLI parity required. On change: toast (`"Session ended."` self / `"Session ended by ${hostName}"` remote), tear down doc binding, navigate Home / exit cleanly, MUST clear ADR-0022 cache.
3. **Idempotency:** last-handled-timestamp guard. Concurrent writes merge via Yjs op-ordering (logical clock + clientID, not numeric); guard ensures fire once per distinct value. Field never cleared during session — clearing breaks eventual consistency for unobserved peers.
4. **Authority:** host-only by UI convention; relay content-blind (ADR-0001) cannot enforce. Same UI-gating discipline as ADR-0020 voter/viewer toggle. Forked-client write is "authenticated participant kicks meeting" — social, not security boundary in v1.
5. **Offline peers:** within snapshot TTL → reconnect picks up `sessionEndedAt` from snapshot, observer fires; past TTL → `4001 / unknown-room` + ADR-0022 cache-clear → "session expired". No special delivery path needed.
6. **Snapshot lifecycle unchanged:** relay still holds 24h. Eager deletion rejected — would force doc parsing (violates ADR-0001) or new control surface.
7. **Host election (ADR-0010):** end-session is deliberate user action. Host disconnect → re-elect, NOT auto-end (lid-close / network blip is routine).

## Trade-offs

- Eventual delivery: peer mid-disconnect can briefly interact with ended session. Documented, not fixed.
- Forked-client abuse possible — accepted v1 threat model.
- Snapshot still held 24h post-end; memory not freed sooner.
- Field is monotonic (write-once, never clear) — load-bearing for eventual-consistency story.
- Cache-clear on observer path required, else stale "Jump back in" banner up to 24h.

## Consequences

- Easier: end-session works steady-state + flaky + reconnect via single observe-and-toast; relay zero new code; idempotency implicit.
- Harder: brief eventual-delivery window; forked-client write possible; snapshot held full TTL.
- Revisit when: real abuse → host-signed marker (touches ADR-0010); ended-session history product → richer end record; memory pressure → eager snapshot deletion successor (touches ADR-0012); compliance kill-switch → relay close-all complement.
