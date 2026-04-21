# ADR-0003: State sync — Yjs CRDT library

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

ADR-0001 committed to a CRDT-over-relay architecture; this ADR selects the specific CRDT library. The library choice affects the sync protocol, the efficiency of network transfers, the local persistence story, and the ergonomics of modeling session state (participants, rounds, votes, metadata).

## Decision

Use **Yjs** as the CRDT library for all synchronized session state.

## Options Considered

### Option A: Yjs (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Open-source |
| Scalability | Excellent for ≤20 collaborators per doc |
| Team familiarity | To be developed |

**Pros:** mature and widely deployed; extremely efficient binary encoding of updates; pluggable provider ecosystem (y-websocket, y-webrtc, y-indexeddb, y-leveldb, custom) so we can swap transports without rewriting state code; rich typed structures (Y.Map, Y.Array, Y.Text) that map cleanly to session data; awareness protocol available for ephemeral presence (typing indicators, cursor positions, connection status) separate from persistent doc state.
**Cons:** documentation can be thin on advanced topics (subdocs, large-array GC); debugging CRDT issues requires understanding the merge model; Angular integration is straightforward but not first-class (no official adapter).

### Option B: Automerge

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Open-source |
| Scalability | Good |
| Team familiarity | Lower |

**Pros:** clean JSON-like API; strong focus on local-first principles; good research provenance.
**Cons:** historically slower and less bandwidth-efficient than Yjs; smaller provider ecosystem; less battle-tested in production WebSocket relay deployments at the scale Yjs has.

### Option C: Custom operational transform or bespoke CRDT

| Dimension | Assessment |
|-----------|------------|
| Complexity | Very High |
| Cost | Significant engineering time |
| Scalability | Depends on implementation |
| Team familiarity | N/A — would be our own |

**Pros:** total control over wire format, merge semantics, and efficiency.
**Cons:** reinventing solved problems; merge bugs are brutal to diagnose; abandons the provider ecosystem; we'd be maintaining a sync algorithm while trying to ship an app.

### Option D: Firebase / Firestore realtime, Liveblocks, or similar hosted real-time

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low upfront |
| Cost | Per-connection / per-message pricing |
| Scalability | Excellent |
| Team familiarity | Varies |

**Pros:** no relay to operate; fast to integrate.
**Cons:** fundamentally incompatible with ADR-0001 — these services are authoritative servers that hold session content, which violates the content-blind principle. Also introduce vendor lock-in and ongoing cost.

## Trade-off Analysis

Yjs wins on production maturity, efficiency, and the provider ecosystem that gives us flexibility to change transports later without touching state code. Automerge is philosophically similar but is about two ecosystem-generations behind on real-time collaborative-editor production use. Custom CRDTs are a non-starter for a solo-led project. Hosted real-time backends violate the architecture committed in ADR-0001.

The provider ecosystem is the sleeper benefit: today we use `y-websocket`, tomorrow we might opportunistically add `y-webrtc` (if we reverse course on that), or add `y-indexeddb` for PWA storage, or drop in a custom provider for Bluetooth mesh in v2. The state model doesn't change.

## Consequences

**Easier:**
- Late-joiner sync, partition recovery, and concurrent edits are handled correctly without manual reconciliation code.
- Awareness protocol gives us presence (online/offline participants, currently-typing, etc.) without conflating it with persistent doc state.
- Binary update format is bandwidth-efficient — the relay moves less data.

**Harder:**
- Team must learn Yjs mental model: shared types vs. JS objects, observing changes, transactions.
- Debugging divergence bugs requires reading binary update logs or using Y.encodeStateAsUpdate diffs.
- Schema changes to the Yjs doc require a migration strategy — once persisted in local stores, documents can't be rewritten arbitrarily.

**Revisit triggers:**
- Automerge reaches parity on bandwidth and provider ecosystem (unlikely soon, but worth periodic checks).
- Yjs abandonment or major backward-incompatible rewrite (also unlikely).

## Action Items

- [ ] Design the Yjs doc schema (separate planning task, next step after ADRs are written).
- [ ] Establish a convention for what lives on awareness vs. the doc (rule of thumb: ephemeral presence → awareness, persistent-across-reconnects → doc).
- [ ] Document a schema-versioning approach before we ship v1, so breaking doc changes have a migration path.
