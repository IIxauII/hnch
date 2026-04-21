# ADR-0012: Ephemeral room snapshot policy

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

In the CRDT-over-relay architecture (ADR-0001), the session's canonical state lives on connected clients. The relay forwards messages but holds no session content. This works seamlessly while at least one client is connected — clients sync via the relay, and local persistence (ADR-0004) covers reloads.

It breaks down in a specific, realistic scenario: **everyone disconnects, then someone later returns**. If the returning user is on a fresh device (or cleared local storage), their client has nothing locally. The relay has nothing to hand them. No other peer is online to sync from. Result: the session appears empty despite being "alive" in everyone else's local storage.

To solve this without compromising the content-blind relay principle, we introduce an **ephemeral snapshot** — the relay retains an opaque copy of the Yjs doc state when a room goes empty, so returning peers can rehydrate.

## Decision

The relay holds an **in-memory snapshot** of each room's Yjs doc state as follows:

- **When:** when the *last* peer disconnects from a room, the relay captures the current Yjs state (as an opaque binary blob) and timestamps it.
- **TTL:** 24 hours from last-peer-disconnect. If no peer reconnects within 24 hours, the snapshot is discarded and the room is gone.
- **Storage:** in-memory only. Not persisted to disk. A relay restart or redeploy discards all in-memory snapshots.
- **Keying:** each room has a stable internal UUID; the snapshot is keyed by this UUID. The 6-character room code (ADR-0008) is a separate lookup that resolves to the UUID, so code recycling is decoupled from snapshot identity.
- **Content-blindness preserved:** the relay does not parse, inspect, or interpret the snapshot. It is the same opaque binary CRDT blob the relay was forwarding during normal operation.

## Options Considered

### Option A: No snapshots — if everyone disconnects, the room is gone

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Cost | None |
| User experience | Poor for the rejoin case |
| Team familiarity | N/A |

**Pros:** perfectly stateless relay; simplest code.
**Cons:** the "returned after lunch" case fails for anyone on a fresh device. In practice this means a user whose phone dies during a meeting cannot rejoin on their laptop. Unacceptable for a collaborative tool.

### Option B: In-memory, 1-hour TTL

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Small memory overhead per idle room |
| User experience | Covers short absences |
| Team familiarity | Standard |

**Pros:** minimal memory footprint; covers the "left for lunch" case.
**Cons:** fails for overnight returns — a team that meets for 30 minutes and comes back the next morning finds an empty room.

### Option C: In-memory, 24-hour TTL (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Medium |
| Cost | Moderate memory per idle room |
| User experience | Covers realistic rejoin windows |
| Team familiarity | Standard |

**Pros:** covers "back tomorrow" which is the most common realistic rejoin window; keeps the privacy posture intact (nothing on disk); relay restart loss is a rare and acceptable breakage.
**Cons:** relay restarts lose all in-memory snapshots; memory is held for up to 24 hours per empty room (bounded by room concurrency).

### Option D: In-memory + on-disk, 24-hour TTL

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Disk I/O, backup considerations |
| User experience | Best — survives restarts |
| Team familiarity | Standard |

**Pros:** snapshots survive relay deploys and restarts; best user experience.
**Cons:** shifts the privacy posture — we now have a server that persists session data (opaque, but still), which changes how we can talk about the tool; introduces encryption-at-rest, backup, and retention questions; meaningful extra operations work for a marginal user-experience improvement over Option C.

## Trade-off Analysis

Option C is the sweet spot for v1. It covers the realistic user experience (come back within a day) while keeping the privacy posture strong (no session data ever touches disk, even opaque). The accepted breakage — "relay restart during a deploy loses idle snapshots" — is rare in practice (normal operation does not require frequent relay restarts) and the cost is bounded (the users most affected are those in idle rooms; actively-connected users are unaffected).

Option D is a reasonable v2 if user feedback justifies it, but "we got disconnected during our sprint planning lunch break, came back, lost everything because you deployed" is a specific enough complaint that we'd hear about it well before it became widespread.

Keying the snapshot by internal UUID rather than room code is a small structural choice that pays off later: we can retire and release room codes independently of snapshot lifecycle, and if we ever want aliased codes (e.g., short vs. long), we can add them without touching the snapshot store.

## Consequences

**Easier:**
- The "returned later on a new device" case works — users don't lose their session to a phone dying.
- Privacy framing is preserved — session data never written to disk.
- Memory is bounded by active-plus-recently-active-room count; at realistic scale the relay footprint is trivial.

**Harder:**
- Relay has to track "room that has no clients but has a snapshot" as a distinct state; the room-lifecycle state machine grows.
- Memory management matters — snapshot size × idle room count × 24 hours. At reasonable scale this is fine; at Reddit-front-page scale we'd want to monitor.
- Relay redeploys require a communication strategy (or are just accepted losses). A deploy banner like "relay restart in 10 minutes, idle sessions may be lost" is enough.

**Revisit triggers:**
- Pattern of user complaints about lost sessions after relay events → add Option D (on-disk persistence).
- Memory pressure on the relay from many idle-room snapshots → add an overall cap or a memory-based LRU eviction.

## Action Items

- [ ] Implement the empty-room snapshot capture on last-peer-disconnect.
- [ ] Implement the 24-hour TTL sweeper.
- [ ] Implement the snapshot-delivery handshake when a client connects to an otherwise-empty room.
- [ ] Document the relay's memory-usage characteristics for future operational planning.
