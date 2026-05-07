# ADR-0003: State sync — Yjs CRDT library

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0001 committed to CRDT-over-relay; this ADR picks the library.
- Choice affects sync protocol, wire efficiency, persistence story, state-modeling ergonomics.

## Decision

Use **Yjs** for all synchronized session state.

## Options

- **A — Yjs (chosen):** mature, widely deployed. Pros: efficient binary updates; pluggable provider ecosystem (y-websocket, y-webrtc, y-indexeddb, custom) → swap transports without rewriting state; rich types (Y.Map/Array/Text); awareness protocol for ephemeral presence separate from doc. Cons: docs thin on advanced topics (subdocs, GC); CRDT debugging requires merge-model fluency; no official Angular adapter.
- **B — Automerge:** Pros: clean JSON-like API; strong local-first focus; good research provenance. Cons: historically slower + less bandwidth-efficient than Yjs; smaller provider ecosystem; less battle-tested at scale.
- **C — Custom OT or bespoke CRDT:** Pros: total control over wire + merge. Cons: reinvents solved problems; brutal merge-bug diagnosis; abandons provider ecosystem; maintaining a sync algo while shipping app.
- **D — Firebase/Firestore/Liveblocks:** Pros: no relay to operate; fast integration. Cons: violates ADR-0001 (authoritative servers hold session content); vendor lock-in; per-connection pricing.

## Trade-offs

- Yjs mental model (shared types, transactions, observers) must be learned.
- Divergence bugs diagnosed via binary update logs / state diffs.
- Schema changes need migration strategy once persisted locally.

## Consequences

- Easier: late-joiner sync, partition recovery, concurrent edits free; awareness gives presence cleanly separated from doc; bandwidth-efficient binary format.
- Harder: team learning curve; binary-update debugging; doc schema migrations once shipped.
- Revisit when: Automerge reaches parity on bandwidth + provider ecosystem; Yjs abandoned or major backward-incompatible rewrite.

## Action Items

- [ ] Design Yjs doc schema (next planning task).
- [ ] Convention: ephemeral presence → awareness; persistent across reconnects → doc.
- [ ] Document schema-versioning approach before v1 ship.
