# ADR-0023: Session-end-for-everyone — host-written doc broadcast

**Status:** Accepted
**Date:** 2026-04-26
**Deciders:** Xau

## Context

A pointing-poker session is ephemeral ([ADR-0006](0006-ephemeral-sessions.md)) but until v1 there was no explicit way to *end* one. Sessions ended only by attrition: peers closed tabs, the relay's 24-hour snapshot ([ADR-0012](0012-snapshot-policy.md)) eventually expired, the room code was retired ([ADR-0008](0008-room-code-format.md)). For most sessions that is fine. For some — "we finished, please drop everyone now" or "scrap this room, we'll start a new one" — leaving stragglers in the lobby is awkward and lets a peer keep typing into a doc nobody else is reading.

We added an "End session for everyone" host action and now need to pin its semantics in an ADR. The mechanism shipped is: the host writes `meta.sessionEndedAt` (Unix ms) to the Yjs doc; every client observes the field via `SessionEndService`, shows a toast, and navigates Home. The field is additive and optional; absence means "still active". This ADR records *why* that approach was taken, what the alternatives were, and the non-obvious interactions with [ADR-0010](0010-host-election.md) (host election) and [ADR-0012](0012-snapshot-policy.md) (snapshot lifecycle).

The decision is structural because the same outcome ("everyone leaves") can be achieved several ways with very different failure modes:

- **Doc-broadcast (chosen):** the doc itself carries the end signal. CRDT semantics handle delivery.
- **Relay close-all:** the relay actively closes every WebSocket on the host's command. Server-side enforcement.
- **Per-client leave-on-host-leave:** clients voluntarily leave when they observe the host disconnecting.

Each interacts differently with [ADR-0001](0001-networking-crdt-over-relay.md)'s content-blind relay, with offline peers, with returning peers, and with [ADR-0010](0010-host-election.md)'s host-election logic. Without a written decision, a future contributor could rip out the doc-write approach in favor of "just close the sockets" without seeing the cascade.

## Decision

1. **Mechanism — host writes `meta.sessionEndedAt`.** When the host taps "End session for everyone", the client calls `endSessionForEveryone(doc)` which sets `meta.sessionEndedAt = Date.now()` inside a single `Y.Doc` transaction. The field is documented in [`schema.md`](../schema.md) as **additive** and **optional**: absent means "still active", present means "ended at this timestamp". No other field is written; round history, settings, and participants are left as-is so the snapshot remains coherent.

2. **Observers — every client MUST observe `meta.sessionEndedAt`.** The mobile / PWA client implements this via `SessionEndService` (`packages/client/src/app/core/session-end.service.ts`), an eager-instantiated singleton that watches `meta.sessionEndedAt` via a signal effect; CLI parity for this observer is required by [ADR-0021](0021-cli-package.md) and is currently absent — tracked as an Action Item below. On observed change the observer:
   - Shows a toast — `"Session ended."` if the local user triggered it, `"Session ended by ${hostName}"` if the change came from a peer.
   - Calls `docService.endSession()` (or the CLI equivalent) to tear down the local doc binding and sync provider.
   - Navigates to Home (or in the CLI, exits cleanly).
   - MUST drop the [ADR-0022](0022-last-session-cache.md) last-session cache as part of the teardown so the Home banner / `hnch resume` does not re-offer the dead room. (Currently wired only on the lobby/home-direct end paths in the mobile client; the remote-observer path in `SessionEndService` does not yet call `LastSessionService.clear()` — tracked as an Action Item.)

3. **Idempotency — last-handled timestamp guard.** `SessionEndService` tracks the `sessionEndedAt` value it last acted on. Concurrent writes from two host candidates (rare — the [ADR-0010](0010-host-election.md) election normally avoids this) merge under Yjs's CRDT op-ordering on the `meta` Y.Map (logical clock + clientID tiebreak — *not* numeric value comparison): the late-arriving op's value is what observers eventually see. The handled-timestamp guard ensures observers act on each distinct value at most once, so the toast and navigation fire exactly once per session, not once per write. The field, once present, is never cleared during a session — clearing would muddle the "ended/active" semantics for any peer that hadn't yet observed the original write.

4. **Authority — host only, by convention; relay does not enforce.** Per [ADR-0001](0001-networking-crdt-over-relay.md) the relay is content-blind; it has no view into doc fields and cannot reject a `sessionEndedAt` write from a non-host. The "host-only" rule is therefore enforced **client-side**: only the host's UI surfaces the End-Session control, the same way [ADR-0020](0020-participant-viewer-voter-role.md)'s voter/viewer toggle is gated UI-side rather than relay-side. A malicious peer using a forked client could write the field anyway. That's accepted — the threat is "an authenticated meeting participant kicks the meeting" which is a social problem, not a security boundary; the data the doc carries is the same data that participant could have read or scrambled by other means. If this becomes a real concern, a future ADR can add a host-signed marker, but the threat model in v1 does not justify the complexity.

5. **Offline-peer behavior — eventual consistency via the snapshot.** A peer who is offline when the host ends the session catches up on next connect. Two cases:
   - **Within snapshot TTL ([ADR-0012](0012-snapshot-policy.md)):** the relay still holds the doc; on reconnect, the y-websocket sync hands the peer the snapshot, the `sessionEndedAt` field is present, `SessionEndService` fires, the peer is gracefully kicked. No special protocol step needed.
   - **After snapshot TTL:** the room is gone. The peer's reconnect attempt resolves to `unknown-room` (close code 4001 per [ADR-0016](0016-client-relay-connection-handshake.md)) and the [ADR-0022](0022-last-session-cache.md) cache-clear path fires, surfacing "session expired". The user lands Home either way; the toast wording differs but the outcome is identical.

   This means we do **not** need a special "session ended" delivery path; piggybacking on the snapshot is correct and the failure mode (TTL elapsed) collapses to an existing handled case.

6. **Snapshot lifecycle after end.** Setting `sessionEndedAt` does **not** alter [ADR-0012](0012-snapshot-policy.md)'s snapshot policy. The relay still keeps the doc in memory for the standard 24 hours after the last peer disconnects. We considered eagerly deleting the snapshot when `sessionEndedAt` is observed; rejected because it would require the relay to either parse the doc (violating content-blindness) or accept a separate control message (introducing a new protocol surface). The snapshot will be discarded when its normal TTL expires, by which time — assuming the observer parity Action Items below land — no client cares: every reachable peer has seen the end and cleared its cache. Returning peers within TTL get the closed-session toast and clean exit; returning peers past TTL get `unknown-room`. Both are fine.

7. **Interaction with host election ([ADR-0010](0010-host-election.md)).** The "End session" action is only available while the user *is* the host. If the host disconnects mid-tap, the [ADR-0010](0010-host-election.md) 5-second debounced re-election can promote another peer; that peer would then need to retap if continuing the end-session intent. We do not auto-end on host disconnect — host departure is a routine event during a meeting (laptop lid closes, network drops) and re-electing rather than ending is the correct behavior for the routine case.

## Options Considered

### Option A: Host writes `meta.sessionEndedAt`; clients observe and navigate (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one optional field, one observer service |
| Offline-peer correctness | Excellent — snapshot delivers on reconnect |
| Relay impact | None — fully content-blind |
| Idempotency | Trivial — Y.Map last-write-wins + handled-timestamp guard |
| Team familiarity | Standard CRDT pattern |

**Pros:** the doc *is* the channel; the same machinery that delivers everything else delivers the end signal. Returning peers get the news for free via the snapshot. The relay doesn't need a new endpoint, doesn't need to parse the doc, and doesn't need a notion of "host". CRDT merge semantics give us idempotency without additional protocol. The field is small (one number, one Y.Map key) so the cost is zero.
**Cons:** delivery is eventual rather than immediate — a peer that's mid-disconnect can briefly continue interacting with a session the host has already ended. We accept this because the window is sub-second on a working connection and the toast-on-reconnect handles the disconnected-longer case correctly. A malicious forked client can write the field; not a security boundary in v1.

### Option B: Relay close-all on a dedicated control message

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — new relay endpoint or message type, host-auth wiring |
| Offline-peer correctness | Poor — close happens *now*; peer that reconnects later sees a normal-looking session and won't know it ended |
| Relay impact | Significant — relay must authenticate "host" and close every socket |
| Idempotency | Manual — need de-dup of close commands |
| Team familiarity | Standard but cuts against [ADR-0001](0001-networking-crdt-over-relay.md) |

**Pros:** instant disconnect for everyone currently online. The user experience for that subset is crisp.
**Cons:** breaks [ADR-0001](0001-networking-crdt-over-relay.md)'s content-blind posture by requiring the relay to know about hosts and accept content-shaped control messages. A peer that reconnects after the close-all has no record that the session ended — they'd see whatever snapshot the relay still has, with no `sessionEndedAt` flag, and would assume it's a quiet active room. We'd then need *both* mechanisms (close-all for online peers, doc field for everyone else) to handle the rejoin case, doubling the surface for marginal benefit. The "everyone is online when the host ends it" assumption is also unrealistic — that's the case where doc-broadcast is fastest anyway.

### Option C: Per-client leave-on-host-leave (no explicit end)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Offline-peer correctness | N/A — there is no end signal |
| Relay impact | None |
| Conflation hazard | High — confuses "host went to lunch" with "session is over" |
| Team familiarity | Standard |

**Pros:** no new mechanism — observe host disconnect, leave.
**Cons:** misreads the most common reason a host disconnects (transient network, lid close). Hosts already get re-elected per [ADR-0010](0010-host-election.md); ending the session on every host-out event would make every flaky-network host a meeting-killer. There is no way to express "yes, really end it" distinct from "I'll be right back" without a separate signal — and once you have a separate signal, you've reinvented Option A.

### Option D: Doc field + relay-side eager snapshot deletion

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Offline-peer correctness | Mixed — within TTL fine, past TTL slightly different |
| Relay impact | Requires parsing or new control surface |
| Privacy | Same as ADR-0012 |
| Team familiarity | Standard |

**Pros:** memory cleared sooner; no "ended room squatting in RAM" feeling.
**Cons:** requires the relay to either parse the doc (violating content-blindness) or honor a host-signed "delete now" message (new auth surface). The benefit is small — at v1 scale the standard 24-hour TTL plus eviction-on-rejoin is plenty. Defer until measured memory pressure justifies it.

## Trade-off Analysis

Option A wins because it pushes the work to the layer that's already doing it. Yjs-via-relay is the delivery mechanism for every other piece of session state; making the end signal travel by the same path means we don't introduce a parallel mechanism for a one-time event. The cost paid — eventual delivery, no relay enforcement of host authority — is the same cost we already pay for everything else in the doc, and the same cost the [ADR-0001](0001-networking-crdt-over-relay.md) architecture deliberately accepts.

The Option B "instant close" property looks attractive until you ask what happens to the peer that reconnects an hour later. With Option A, that peer reads a snapshot containing the `sessionEndedAt` field and is gracefully kicked; with Option B, the peer reads a snapshot that *does not* contain that field (because B operates on sockets, not state) and assumes the session is still active. The cleanest fix would be to do Option B *and* write a doc field — at which point Option A is doing all the structural work and Option B is a redundant accelerant. We accept the brief eventual-delivery window in exchange for a single source of truth.

The decision not to clear `sessionEndedAt` once set is small but load-bearing. If we cleared it on session end (e.g., as part of the local teardown), a not-yet-observed peer would never see it. Treating the field as monotonic — write once, never clear, snapshot carries it forward — is what makes the eventual-consistency story work without a separate "session was ended" log.

The interaction with [ADR-0010](0010-host-election.md) is intentional: end-session is an explicit user action, not a side effect of the host going offline. A re-elected host has the option to end the session if they choose, but the system does not make that choice for them. This keeps the routine "host's network blipped" case from being indistinguishable from the deliberate "I am ending this" case.

The interaction with [ADR-0022](0022-last-session-cache.md) is also intentional: clearing the cache as part of the end-session teardown means the Home banner / `hnch resume` won't keep offering a session the user just deliberately ended. Without that line, the cache TTL would still fire eventually, but the user would see a stale banner for up to 24 hours — a clear UX regression for an action whose whole point is finality. (This ADR's prescriptive contract requires that clear; the mobile remote-observer path and the CLI observer are gap-closing follow-ups in Action Items.)

## Consequences

**Easier:**
- The end-session feature works in steady-state, on flaky networks, and across reconnects without a separate code path. The "I came back and the session was already over" case is a single observe-and-toast.
- The relay needs no new code, no new auth, and no new content awareness. [ADR-0001](0001-networking-crdt-over-relay.md)'s content-blind posture is preserved.
- Idempotency is implicit — Yjs CRDT op-ordering on the Y.Map key plus the local handled-timestamp guard means double-fires are impossible without additional plumbing.

**Harder:**
- Delivery is eventual rather than instant. A peer mid-disconnect can interact with the session for a brief window after the host ends it. The window is sub-second on a healthy connection and is not user-visible in any current UX flow; we document it rather than fix it.
- A malicious forked client can set `sessionEndedAt`. The threat is "authenticated meeting participant kicks the meeting", which we treat as a social rather than security problem. If real-world abuse occurs, a host-signed marker becomes a future ADR.
- The relay continues to hold the snapshot for the full [ADR-0012](0012-snapshot-policy.md) TTL after end. Memory is not freed sooner. At v1 scale this is fine; revisit if measured pressure justifies it.

**Revisit triggers:**
- Real abuse of the end-session field by non-hosts → write a successor ADR introducing host-signed markers (would also touch [ADR-0010](0010-host-election.md)).
- A product decision to surface "ended sessions" history (e.g., "your last 5 sessions" with end times) → may want a richer end record (who ended it, why) than a single timestamp; would supersede this ADR's field shape but leave the mechanism intact.
- Memory pressure from snapshots-of-ended-sessions sitting in RAM until TTL → consider Option D (relay-side eager deletion) as a successor; would interact with [ADR-0012](0012-snapshot-policy.md).
- Need for instant-everywhere disconnect (e.g., compliance "kill switch") → would force Option B as a *complement* to, not replacement for, Option A.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the doc-broadcast end mechanism.
- [ ] **Gap-closing follow-up (tracked under impl task T24):** wire `LastSessionService.clear()` into `SessionEndService.handleSessionEnd` (`packages/client/src/app/core/session-end.service.ts`) before navigating Home — currently only the lobby/home-direct end paths clear the cache, so the remote-observer path leaves a stale Jump-back-in banner pointing at the just-ended room.
- [ ] **Gap-closing follow-up (tracked under impl task T25):** add a `meta.sessionEndedAt` observer to the CLI (currently absent in `packages/cli/src/`) that prints "session ended by host", clears `~/.config/hnch/last-session.json` per [ADR-0022](0022-last-session-cache.md), and exits gracefully. Required for the [ADR-0021](0021-cli-package.md) parity contract; until it lands, CLI peers in a host-ended session do not exit and `hnch resume` keeps re-offering the dead room.
- [ ] Cross-link from [ADR-0010](0010-host-election.md) (typo-class addition) noting that host re-election does not auto-end the session — end is a deliberate action recorded in the doc per this ADR.
- [ ] Cross-link from [ADR-0012](0012-snapshot-policy.md) (typo-class addition) noting that snapshot lifecycle is unchanged after end and that returning peers within TTL receive the end signal via the snapshot.
- [ ] Cross-link from [ADR-0022](0022-last-session-cache.md) (typo-class addition) noting that the last-session cache is cleared as part of end-session teardown.
- [ ] Verify that [`schema.md`](../schema.md)'s `meta.sessionEndedAt` description matches the additive/monotonic semantics in this ADR.
- [ ] Verify `SessionEndService`'s handled-timestamp guard covers the "two host candidates write concurrently then both arrive in order" case (current implementation appears correct; add a test if not already present).
- [ ] Confirm the End-Session control is rendered only when the local participant is the host — same UI-gating discipline as [ADR-0020](0020-participant-viewer-voter-role.md)'s viewer/voter toggle. Non-host clients must not see the control.
- [ ] Confirm the "Session ended by ${host}" toast wording is distinct from the [ADR-0022](0022-last-session-cache.md) "session expired" wording so users can tell a deliberate end from a TTL drop.
