# ADR-0010: Host election mechanics

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

In the CRDT-over-relay architecture committed to in ADR-0001, the relay has no concept of "who is the host." Yet several session operations require a single authoritative actor: triggering manual reveal, broadcasting the auto-reveal on timer expiry (see ADR-0011), and admitting invite-only joiners (see ADR-0009). Host migration is a stated product requirement — if the current host drops, the session should continue without manual intervention.

The election protocol has to be implemented on top of the shared Yjs doc and must be deterministic enough that all clients reach the same conclusion under churn, while stable enough that brief disconnects don't cause the host role to flap.

## Decision

Host election proceeds as follows:

1. The **session creator** is the initial host. This is recorded in the Yjs doc on session creation as a stable field (`hostPeerId`).
2. When the current host disconnects, clients wait **5 seconds (debounce)** before reacting. Most disconnects are transient network blips, and flapping the host role every time someone's Wi-Fi hiccups is a worse user experience than a brief gap.
3. If the host is still absent after the debounce, each connected client independently computes the new host as **the lexicographically-lowest device ID among currently-connected peers**. Because all clients see the same awareness state (connected peers) and apply the same function, they reach the same answer without coordination.
4. The newly-elected host writes itself to `hostPeerId` in the doc (a concurrent write by multiple clients Yjs-merges to the same value because they all computed the same peer ID).
5. If the original host **reconnects later**, they do **not** reclaim the role. The current `hostPeerId` is respected.

The peer ID is the device identifier from ADR-0005.

The UI surfaces the current host with a subtle crown icon next to their name in the participant list — this makes the "only the host sees the manual reveal button" and "only the host admits invite joiners" behaviors legible to everyone.

## Options Considered

### Option A: Creator is host, lowest-ID-on-drop with debounce (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Medium |
| Cost | None |
| Robustness | Good with debounce |
| Team familiarity | Standard |

**Pros:** creator intent is respected — the person who started the session is initially in charge; election is deterministic so all clients agree without a consensus protocol; debouncing handles transient network issues gracefully; no-reclaim-on-reconnect keeps state simple.
**Cons:** a user who creates many sessions accidentally being host is not always what they want (minor — they can functionally cede control by just leaving); lexicographic device ID is an arbitrary ordering.

### Option B: Earliest-joined-among-connected is always host

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Robustness | OK |
| Team familiarity | Standard |

**Pros:** "senior peer" is an intuitive concept; doesn't privilege the creator (arguably fairer).
**Cons:** requires tracking stable join timestamps via awareness, which are easier to manipulate than a device ID; role flaps every time the senior peer steps away; doesn't respect the creator's intent.

### Option C: Explicit host handoff with automatic fallback

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | None |
| Robustness | Good |
| Team familiarity | Standard |

**Pros:** host can intentionally pass the baton (useful if the creator is a facilitator who wants a developer lead to drive estimation); automatic fallback handles drops.
**Cons:** requires UI for handoff, which is scope creep for v1; not strictly needed — the automatic-on-drop behavior alone covers every real-world scenario we know of.

### Option D: No host — all roles are voluntary/consensual

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Robustness | Varies |
| Team familiarity | Standard |

**Pros:** elegant in a pure-CRDT sense; no election at all.
**Cons:** several operations *need* a single actor (timer expiry, reveal trigger, invite admission). Without a host, two users racing to trigger reveal would both broadcast the event; two users racing to admit an invite-only joiner is incoherent. Some singleton authority is required; the question is only how to elect it.

## Trade-off Analysis

Option A minimally satisfies every requirement and respects the intuitive expectation that the person who opened the room runs it. The 5-second debounce was chosen because in practice, WebSocket reconnects after a lost-connectivity event take 2–4 seconds; 5s lets the original host reclaim transparently for blips while still being short enough that users don't notice a "no host available" gap in the worst case. No-reclaim simplifies the doc state — once `hostPeerId` changes, it's changed until the new host leaves.

Option C (explicit handoff) is a reasonable v2 addition; we deferred it because the additional UX and doc state isn't needed to make the product functional.

## Consequences

**Easier:**
- Manual reveal, auto-reveal authority, and invite admission have a clear owner at all times.
- Clients converge on the same host without needing a consensus protocol.
- Brief disconnects don't disrupt the session's flow.

**Harder:**
- Debounce introduces a 5-second window where no host exists; during that window, manual-reveal buttons are disabled for everyone and auto-reveal is paused. Edge cases (host drops exactly at timer expiry) need explicit handling.
- A malicious client could write a fake `hostPeerId` into the doc. Because the Yjs doc is writable by any connected peer, we can't enforce host legitimacy without vote-signing. This is consistent with the broader vote-integrity posture (not enforced in v1).

**Revisit triggers:**
- User feedback suggesting explicit handoff → add Option C.
- Vote-signing / device-key work → use signed host claims so a malicious client cannot impersonate the host.

## Action Items

- [ ] Implement the awareness-based "who is connected" view clients will use to compute host.
- [ ] Implement the 5-second debounce and election logic as a client-side state machine.
- [ ] Add the crown UI indicator on the participant list.
- [ ] Explicitly test the edge case: host disconnects during timer countdown — the new host must take over expiry using the in-doc `timerStartedAt` (see ADR-0011).
