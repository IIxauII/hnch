# ADR-0001: Networking — CRDT sync over a content-blind relay

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Real-time state sync needed across ≤20 peers per session on web, iOS, Android.
- Product principles: privacy, offline tolerance, low ops cost, no accounts.
- Domain: short-lived estimation sessions, low message volume, partition-tolerant.
- Long-form trade-off study in [`../networking-analysis.md`](../networking-analysis.md).

## Decision

Sync state via **Yjs CRDTs over a self-hosted y-websocket relay**. Relay is content-blind — forwards opaque binary updates, never parses session data. No WebRTC. No authoritative session server.

## Options

- **A — Pure P2P (WebRTC mesh):** lowest latency on success. Pros: no server content; "no central server" branding. Cons: y-webrtc unreliable on iOS WKWebView; TURN ops + cost; firewall-blocked UDP; 190 pairwise links at 20 peers; signaling still needs server.
- **B — Authoritative session server:** server owns session state. Pros: simplest timer/reveal/host/vote-integrity; trivial late-join; easy audit. Cons: server holds session content (privacy regression); offline editing harder; higher ops burden than stateless relay.
- **C — CRDT over content-blind relay (chosen):** clients hold canonical state. Pros: offline-native; opaque blobs preserve privacy; Yjs handles partitions + late-join; no auth stack; cheap stateless relay. Cons: vote integrity cooperative-only; timer/reveal authority needs in-doc protocol (ADR-0010, ADR-0011); weaker server-side debug; requires snapshot for full-disconnect recovery (ADR-0012).

## Trade-offs

- Vote integrity not server-enforceable until vote-signing added.
- Host authority lives in-doc, not server-side → more client logic.
- No server-side session logs → debugging needs client telemetry or repro.
- Snapshot on relay (ADR-0012) is small deviation from pure statelessness.

## Consequences

- Easier: offline + flaky-net free via Yjs; same sync path on PWA/iOS/Android; truthful privacy posture; stateless relay scales horizontally on small VM.
- Harder: distributed host protocol; debugging without server logs; "everyone disconnects" needs ephemeral snapshot.
- Revisit when: enterprise demand for enforceable audit/integrity → migrate to B (Yjs schema maps cleanly to relational); relay-restart loses sessions → add disk-persisted snapshots; sustained latency complaints (post-measurement) → reconsider opportunistic WebRTC.

## Action Items

- [ ] Stand up local y-websocket relay (Phase 1).
- [ ] Integrate Yjs with clean sync-provider abstraction (keeps B migration possible).
- [ ] Document relay ops expectations (stateless, no DB) in runbook.
