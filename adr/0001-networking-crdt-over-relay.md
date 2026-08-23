# ADR-0001: Networking — CRDT sync over a content-blind relay

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Real-time state sync needed across ≤20 peers per session on web, iOS, Android.
- Product principles: privacy, offline tolerance, low ops cost, no accounts.
- Domain: short-lived estimation sessions, low message volume, partition-tolerant.

## Decision

Sync state via **Yjs CRDTs over a self-hosted y-websocket relay**. Relay is content-blind — forwards opaque binary updates, never parses session data. No WebRTC. No authoritative session server.

## Trade-offs

- Vote integrity not server-enforceable until vote-signing added.
- Host authority lives in-doc, not server-side → more client logic.
- No server-side session logs → debugging needs client telemetry or repro.
- Snapshot on relay (ADR-0012) is small deviation from pure statelessness.

## Consequences

- Easier: offline + flaky-net free via Yjs; same sync path on PWA/iOS/Android; truthful privacy posture; stateless relay scales horizontally on small VM.
- Harder: distributed host protocol; debugging without server logs; "everyone disconnects" needs ephemeral snapshot.
- Revisit when: enterprise demand for enforceable audit/integrity → migrate to authoritative server (Yjs schema maps cleanly to relational); relay-restart loses sessions → add disk-persisted snapshots; sustained latency complaints (post-measurement) → reconsider opportunistic WebRTC.
