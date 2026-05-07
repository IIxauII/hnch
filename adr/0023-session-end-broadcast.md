# ADR-0023: Session-end-for-everyone — host-written doc broadcast

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Sessions ephemeral (ADR-0006) but no explicit "end" pre-v1; sessions died by attrition + 24h snapshot expiry (ADR-0012) + code retirement (ADR-0008).
- "We're done, drop everyone" / "scrap this room" use cases left stragglers in lobby.
- Shipped mechanism: host writes `meta.sessionEndedAt` (Unix ms) to Yjs doc; clients observe, toast, navigate Home.
- Same outcome reachable several ways with different failure modes — must pin choice + interactions with ADR-0010 (host election) + ADR-0012 (snapshot lifecycle).

## Decision

1. **Mechanism:** host calls `endSessionForEveryone(doc)` → sets `meta.sessionEndedAt = Date.now()` in single transaction. Field additive + optional; absent = active.
2. **Observers:** every client MUST observe `meta.sessionEndedAt`. Mobile = `SessionEndService`; CLI parity required (currently absent — Action Item). On change: toast (`"Session ended."` self / `"Session ended by ${hostName}"` remote), tear down doc binding, navigate Home / exit cleanly, MUST clear ADR-0022 cache.
3. **Idempotency:** last-handled-timestamp guard. Concurrent writes merge via Yjs op-ordering (logical clock + clientID, not numeric); guard ensures fire once per distinct value. Field never cleared during session — clearing breaks eventual consistency for unobserved peers.
4. **Authority:** host-only by UI convention; relay content-blind (ADR-0001) cannot enforce. Same UI-gating discipline as ADR-0020 voter/viewer toggle. Forked-client write is "authenticated participant kicks meeting" — social, not security boundary in v1.
5. **Offline peers:** within snapshot TTL → reconnect picks up `sessionEndedAt` from snapshot, observer fires; past TTL → `4001 / unknown-room` + ADR-0022 cache-clear → "session expired". No special delivery path needed.
6. **Snapshot lifecycle unchanged:** relay still holds 24h. Eager deletion rejected — would force doc parsing (violates ADR-0001) or new control surface.
7. **Host election (ADR-0010):** end-session is deliberate user action. Host disconnect → re-elect, NOT auto-end (lid-close / network blip is routine).

## Options

- **A — Host writes `meta.sessionEndedAt`, clients observe (chosen):** Pros: doc is the channel; reuses delivery; snapshot delivers to returning peers free; relay zero-impact; CRDT idempotency. Cons: eventual delivery (sub-second on healthy connection); forked-client can write field.
- **B — Relay close-all on control message:** Pros: instant disconnect for online peers. Cons: violates ADR-0001 content-blind; reconnect-later peer sees normal session (no flag); needs *both* mechanisms to handle rejoin → A doing all structural work anyway.
- **C — Per-client leave-on-host-leave:** Pros: no new mechanism. Cons: conflates "host went to lunch" with "session over"; ADR-0010 re-election makes flaky-network host a meeting-killer; once you add a real signal you've reinvented A.
- **D — Doc field + relay-side eager snapshot deletion:** Pros: memory freed sooner. Cons: relay must parse doc or accept signed control message; benefit small at v1 scale.

## Trade-offs

- Eventual delivery: peer mid-disconnect can briefly interact with ended session. Documented, not fixed.
- Forked-client abuse possible — accepted v1 threat model.
- Snapshot still held 24h post-end; memory not freed sooner.
- Field is monotonic (write-once, never clear) — load-bearing for eventual-consistency story.
- Cache-clear on observer path required, else stale "Jump back in" banner up to 24h.

## Consequences

- Easier: end-session works steady-state + flaky + reconnect via single observe-and-toast; relay zero new code; idempotency implicit.
- Harder: brief eventual-delivery window; forked-client write possible; snapshot held full TTL.
- Revisit when: real abuse → host-signed marker (touches ADR-0010); ended-session history product → richer end record; memory pressure → Option D successor (touches ADR-0012); compliance kill-switch → B as *complement* to A.

## Action Items

- [ ] Update CLAUDE.md "Current decisions at a glance".
- [ ] **T24 gap:** wire `LastSessionService.clear()` into `SessionEndService.handleSessionEnd` (`packages/client/src/app/core/session-end.service.ts`) before navigating Home — remote-observer path currently leaves stale banner.
- [ ] **T25 gap:** add `meta.sessionEndedAt` observer to CLI (absent in `packages/cli/src/`); print "session ended by host", clear `~/.config/hnch/last-session.json`, exit. Required for ADR-0021 parity.
- [ ] Cross-link ADR-0010, ADR-0012, ADR-0022 (typo-class). Verify `schema.md` `meta.sessionEndedAt` describes additive/monotonic semantics; End-Session control host-only; toast wording distinct from "session expired".
