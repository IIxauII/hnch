# ADR-0012: Ephemeral room snapshot policy

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0001: canonical state lives on connected clients; relay forwards messages, holds no content.
- Works while ≥1 client connected; ADR-0004 local persistence covers reloads.
- Breaks when **everyone disconnects, then someone returns on a fresh device** — no local state, no peer to sync from, relay has nothing → session appears empty despite being "alive" in others' storage.

## Decision

Relay holds **in-memory snapshot** of each room's Yjs doc as opaque binary blob.

- **When:** captured on last-peer disconnect, timestamped.
- **TTL:** 24h from last-peer-disconnect; expired snapshots discarded.
- **Storage:** in-memory only; relay restart/redeploy discards snapshots.
- **Keying:** by stable internal room UUID (decoupled from 6-char code in ADR-0008).
- **Content-blindness preserved:** relay does not parse/inspect; same opaque CRDT blob it was forwarding.

## Options

- **A — No snapshots:** stateless relay, simplest. Cons: phone-dies-mid-meeting → cannot rejoin from laptop. Unacceptable.
- **B — In-memory, 1h TTL:** minimal memory; covers lunch break. Cons: fails overnight return.
- **C — In-memory, 24h TTL (chosen):** covers "back tomorrow" — most common rejoin window; nothing on disk → privacy intact; restart loss rare and acceptable.
- **D — In-memory + on-disk, 24h TTL:** survives restarts. Cons: shifts privacy posture (server now persists session data, even opaque); adds encryption-at-rest, backup, retention questions.

## Trade-offs

- Relay restarts during deploy lose idle snapshots — accepted, normal ops don't restart often.
- Memory bounded by active + recently-active room count × snapshot size × 24h.
- Keying by UUID (not code) lets code retire/release lifecycle stay independent and supports future code aliasing.

## Consequences

- Easier: returned-on-new-device case works; privacy framing intact (no disk writes); footprint trivial at scale.
- Harder: relay tracks "no clients but has snapshot" as distinct state — lifecycle SM grows; redeploys need comms strategy ("idle sessions may be lost") or accepted loss.
- Revisit when: users complain after relay events → add Option D on-disk; memory pressure from many idle snapshots → overall cap or LRU eviction.

## Action Items

- [ ] Implement empty-room snapshot capture on last-peer-disconnect.
- [ ] 24h TTL sweeper.
- [ ] Snapshot-delivery handshake when client connects to otherwise-empty room.
- [ ] Document relay memory characteristics for ops planning.
