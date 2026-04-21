# ADR-0001: Networking — CRDT sync over a content-blind relay

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

hnch needs real-time state sync across up to 20 peers per session on web, iOS, and Android. Three broad architectures are available: pure peer-to-peer (WebRTC mesh or similar), a classical authoritative server that owns session state, or a hybrid where clients hold state as CRDTs and a thin server just forwards messages.

The product principles pull toward privacy, offline tolerance, low operational cost, and no user accounts. The domain is short-lived collaborative estimation sessions — low message volume, high interactivity, tolerant of brief clock skew, intolerant of "session lost" failures.

A detailed research write-up of the trade-offs between these three architectures exists in [`../networking-analysis.md`](../networking-analysis.md); that document informed this ADR and should be read for the long version of the reasoning.

## Decision

hnch syncs session state using **Yjs CRDTs exchanged through a self-hosted y-websocket relay**. The relay is content-blind: it forwards opaque binary Yjs updates between clients in the same room and never parses session data. Direct WebRTC peer-to-peer data channels are **not** part of the architecture — considered and dropped. There is no authoritative session server.

## Options Considered

### Option A: Pure P2P (WebRTC mesh)

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | Low compute; real bandwidth costs if TURN relay is needed |
| Scalability | Fine at ≤20 peers |
| Team familiarity | Medium — WebRTC is well-documented but operationally fiddly |

**Pros:** no server-side session content at all; lowest possible latency when direct connections succeed; aligns with "no central server" branding.
**Cons:** y-webrtc is unreliable on iOS WKWebView (already acknowledged in early design); TURN servers cost money and add ops; corporate firewalls block UDP forcing TURN-over-TCP; 190 pairwise connections at the 20-peer cap; signaling still requires a server, so "no server" is a half-truth.

### Option B: Authoritative session server

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Low per-session compute but real per-session state |
| Scalability | Good with horizontal scaling; sticky routing required |
| Team familiarity | High |

**Pros:** simplest timer authority, reveal authority, host concept, and vote integrity enforcement; easy audit logging and rate limiting; trivial late-join snapshotting; simplest client code (no CRDT merge reasoning).
**Cons:** server now holds session content (privacy regression, compliance surface); offline editing becomes much harder because the server is the source of truth; server operational burden is meaningfully higher than a stateless relay.

### Option C: CRDT over content-blind relay (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Very low — stateless relay, no database, horizontal scaling trivial |
| Scalability | Excellent at the 20-peer cap |
| Team familiarity | Medium — Yjs requires learning CRDT semantics |

**Pros:** clients hold canonical state, so offline editing works natively; relay sees only opaque binary blobs, keeping a strong privacy posture; Yjs handles network partitions and late-joiner sync with no manual reconciliation; no accounts or auth stack needed; operational burden is low.
**Cons:** vote integrity cannot be enforced server-side (deferred to future vote-signing); timer and reveal authority require a distributed-host protocol (see ADR-0010 and ADR-0011); debuggability is weaker without server-side logs; "everyone disconnects then someone returns" requires snapshot support (see ADR-0012).

## Trade-off Analysis

We chose Option C primarily because the CRDT-over-relay model fits the domain shape: planning poker is eventually-consistent by nature (everyone votes, then reveal), partition-tolerant in practice (flaky meeting Wi-Fi is common), and short-lived (no multi-year state to preserve). The authoritative-server model (B) would be cleaner in several specific ways — timer, vote integrity, audit logs — but those improvements don't earn their cost at this product's stage and principles. If we later target regulated or enterprise buyers who require enforceable vote integrity and audit trails, migrating to B is mechanical: the Yjs doc shape maps cleanly to a relational schema, and the CRDT layer can be retired.

Pure P2P (A) looked attractive on paper but fails on iOS WebView practicality and introduces WebRTC operational complexity (TURN, NAT, firewalls) for a latency gain that humans cannot perceive in a tool paced by thumb taps and spoken discussion. Dropping it also makes the cross-platform story much simpler.

## Consequences

**Easier:**
- Offline and flaky-network behavior is essentially free via Yjs.
- Cross-platform parity — the same sync path works on PWA, iOS Capacitor, and Android Capacitor, with no WKWebView escape hatches.
- Privacy posture — we can truthfully say the server never sees vote data.
- Relay is stateless enough to scale horizontally with no coordination; a single small VM suffices for a long time.

**Harder:**
- Host authority (timer, reveal, admit) must be implemented as an in-doc protocol rather than a server-side role. See ADR-0010.
- Debugging a user report requires client-side telemetry (or a reproducing client) because the server has no session logs.
- Vote integrity must be accepted as "cooperative only" until vote signing is added.
- "Everyone disconnects and returns later" requires an ephemeral snapshot on the relay (ADR-0012), which is a small deviation from pure statelessness.

**Revisit triggers:**
- Strong enterprise interest in audit trails or enforceable vote integrity → migrate to Option B.
- Real user pain from "relay restart lost our session" → consider disk-persisted snapshots (a v2 of ADR-0012).
- Sustained user complaints about latency that cannot be resolved at the relay → reconsider opportunistic WebRTC, but only after measurement.

## Action Items

- [ ] Stand up a local y-websocket relay for development (Phase 1 task).
- [ ] Integrate Yjs into the Angular/Ionic app with a clean sync provider abstraction, so Option B migration remains possible if needed later.
- [ ] Document the relay's operational expectations (stateless, horizontal scaling, no database) in an eventual runbook.
- [ ] Remove `project.md` references to "P2P" and "WebRTC" from the primary path (already done — verify).
