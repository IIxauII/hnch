# ADR-0003: State sync — Yjs CRDT library

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0001 committed to CRDT-over-relay; this ADR picks the library.
- Choice affects sync protocol, wire efficiency, persistence story, state-modeling ergonomics.

## Decision

Use **Yjs** for all synchronized session state. Mature, efficient binary updates, pluggable provider ecosystem (y-websocket, y-webrtc, y-indexeddb, custom) → swap transports without rewriting state. Awareness protocol gives ephemeral presence separate from doc.

## Trade-offs

- Yjs mental model (shared types, transactions, observers) must be learned.
- Divergence bugs diagnosed via binary update logs / state diffs.
- Schema changes need migration strategy once persisted locally.
- No official Angular adapter.

## Consequences

- Easier: late-joiner sync, partition recovery, concurrent edits free; awareness gives presence cleanly separated from doc; bandwidth-efficient binary format.
- Harder: team learning curve; binary-update debugging; doc schema migrations once shipped.
- Revisit when: Automerge reaches parity on bandwidth + provider ecosystem; Yjs abandoned or major backward-incompatible rewrite.
