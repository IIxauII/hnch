# ADR-0036: Participant removal lifecycle (voluntary leave + host kick)

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Xau

## Context

The Yjs `participants` Y.Map has been cumulative since [ADR-0006](0006-ephemeral-sessions.md) — entries are added on join and never removed. Two consequences fall out of that:

1. The mobile lobby's "Leave Session" action (3-dot menu) only disconnects the local socket. The participant's record stays in the doc, so to every other peer the leaver appears as a greyed-out, still-present row. Users reasonably expect "leaving" to mean *gone from the active roster*.
2. The host has no way to remove a participant — duplicate joins, mistaken joins, or someone who needs to be cleaned up are all stuck in the roster until the snapshot TTL expires ([ADR-0012](0012-snapshot-policy.md)) or the room is abandoned.

The product requirement is straightforward: *Leave* should make the participant disappear from the active roster for everyone, and the host should be able to do the same to another participant. But a naïve implementation — `participants.delete(id)` — quietly breaks round history. Vote rows in past rounds (`round.votes`) reference participants by ID, and the vote-results / round-history UIs run name lookup against the live `participants` map. Hard-deleting the record falls back to displaying raw participant IDs for departed users. They were really there for those rounds; their votes should remain attributed by name.

The relay is content-blind by [ADR-0001](0001-networking-crdt-over-relay.md) ("the relay is a generic y-websocket relay; it does not parse, validate, or interpret the doc's contents") and the participant-cap close codes in [ADR-0024](0024-participant-cap.md) are limited to upgrade-time enforcement. So removal must travel the same path every other piece of session state travels — through the Yjs doc, with client-side observation — exactly like the session-end broadcast in [ADR-0023](0023-session-end-broadcast.md). There is no relay-side "remove this participant" command and we are not introducing one.

A written decision is warranted because the same outcome ("B is no longer in the roster") can be reached several ways with materially different downstream behavior — hard-delete, two flavors of soft-delete, awareness-only signaling, or a relay-side ban list — and a future contributor unaware of the round-history coherence constraint could easily pick the wrong one.

## Decision

1. **Soft-delete via two new optional fields on the Participant Y.Map record.** Each participant record gains:

   ```ts
   {
     displayName: string,
     joinedAt: number,
     role?: 'voter' | 'viewer',
     leftAt?: number,        // NEW — wall-clock ms when removal occurred
     removedBy?: string,     // NEW — participantId of the actor
   }
   ```

   `removedBy === participantId` ⇒ voluntary leave. `removedBy !== participantId` ⇒ kicked by host. Absent `leftAt` ⇒ active. Both fields are additive and optional.

2. **Active-participant filtering is the single discipline.** A `isActiveParticipant(p): boolean = !p.leftAt` helper in `@hnch/shared` is the choke point. Every consumer that asks "who is in this session right now?" filters through it:
   - Lobby roster (visible participant list).
   - Online intersection (awareness ∩ active participants).
   - Unanimous auto-reveal denominator ([ADR-0018](0018-remove-timer-add-unanimous-reveal.md), refined by [ADR-0020](0020-participant-viewer-voter-role.md) to count online voters): now counts online active voters. **A leaver must not block reveal.**
   - Vote-results "didn't vote" set: excludes left participants from the expected set.

   Round history continues to read the **raw** `participants` map — never filtered — so a departed participant's name still resolves on past rounds. Their votes stay attached to their ID and render with their displayed name, exactly as they did at the time of voting.

3. **Tab close, network drop, and any non-intentional disconnect do NOT set `leftAt`.** Those cases are handled by Yjs awareness exactly as today (online ⇒ awareness entry present; offline ⇒ absent). Only an *intentional* removal — the user tapping Leave or the host confirming Remove — writes `leftAt`. This preserves the [ADR-0022](0022-last-session-cache.md) "Jump back in" reversible-leave model: a user who closes a tab and reopens it within the snapshot TTL rejoins as the same participant in the active roster, no name re-prompt, no role reset.

4. **Doc mutation surface (in `@hnch/shared`).** Three changes in `packages/shared/src/doc.ts`:
   - **`leaveSession(doc, selfId)`** — sets `participants.get(selfId)` fields `leftAt = Date.now()`, `removedBy = selfId`. Inside a single Yjs transaction with the existing `'doc-mutation'` origin tag.
   - **`removeParticipant(doc, hostId, targetId)`** — sets the same fields on `participants.get(targetId)` with `removedBy = hostId`. Same transaction shape. The mutation does **not** check that `hostId` is actually the host; the UI gates on `isHost()` exactly as the End-Session control does per [ADR-0023](0023-session-end-broadcast.md) §4 ("the 'host-only' rule is therefore enforced **client-side**").
   - **`joinSession`** (existing) — extended to clear `leftAt` and `removedBy` when the caller's own participant record already exists. A previously-removed user re-entering the room code re-upserts back into the active roster.

5. **Kicked-client UX via a `ParticipantRemovalService` observer.** Each client runs a Yjs observer (mirrors `SessionEndService` from [ADR-0023](0023-session-end-broadcast.md) §2) watching its own participant record for a transition from "active" to `leftAt` set with `removedBy !== self`. On observation:
   - Show a toast: `"Removed by host"` (distinct from the voluntary "You left the session" toast).
   - Tear down the local doc binding and sync provider (same teardown as `endSession()`).
   - Drop the [ADR-0022](0022-last-session-cache.md) last-session cache — same hygiene as the session-end teardown — so the Home banner / `hnch resume` does not re-offer a session the user can no longer freely re-enter (they can re-enter, but offering it as "your last session" is misleading).
   - Navigate to Home (CLI: exit cleanly).

   The observer is idempotent on `leftAt` value the same way `SessionEndService` guards on `sessionEndedAt`.

6. **No relay-side ban list, no new WebSocket close code.** A user kicked by the host can re-enter the room code; `joinSession` will clear `leftAt` and they're back in the active roster. This is consistent with [ADR-0017](0017-password-hashing-drop-invite-only.md)'s v1 stance:

   > "the threat model is mild enough that a lighter scheme suffices … the threat is 'an authenticated meeting participant kicks the meeting' which is a social problem, not a security boundary"

   Persistent removal is achieved via the existing tool: the host changes the room password (`PATCH /rooms/:uuid/access` per [ADR-0017](0017-password-hashing-drop-invite-only.md)). The kicked user's previous credentials no longer work. Introducing a ban list — whether stored at the relay or in the doc — would cost the relay's content-blindness ([ADR-0001](0001-networking-crdt-over-relay.md)) or a new CRDT structure with admission semantics, for a feature whose v1 demand is unmeasured.

7. **Concurrency posture is unchanged.** Yjs LWW resolves concurrent writes. The realistic race is: a participant is in the middle of selecting a card while the host kicks them. Three cases, all benign:
   - Vote write lands first, kick write lands second → vote is in the doc, but the participant is filtered out of the active roster for live UI; the vote stays attributed in round history.
   - Kick write lands first, vote write lands second → same outcome; the late vote write is harmless because every consumer that cares (active roster, "didn't vote" set, auto-reveal denominator) gates on `leftAt`.
   - Two host candidates concurrently write a kick on the same target → CRDT merge on the Y.Map produces a single record with one `leftAt` / `removedBy` value (logical clock + clientID tiebreak), exactly the pattern [ADR-0023](0023-session-end-broadcast.md) §3 documents for `sessionEndedAt`.

   No transaction coordination required.

## Options Considered

### Option A: Soft-delete with `leftAt` + `removedBy` on the participant record (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — two optional fields, one helper, one observer |
| Round-history coherence | Excellent — raw map preserved, names still resolve |
| Snapshot-rejoin behavior | Excellent — late peer sees the same active/inactive split as everyone else |
| Relay impact | None — fully content-blind |
| Migration | None — additive, backward-compatible |
| Concurrency | Trivial under Yjs LWW |
| Team familiarity | Standard — mirrors [ADR-0020](0020-participant-viewer-voter-role.md)'s additive-field pattern and [ADR-0023](0023-session-end-broadcast.md)'s observer pattern |

**Pros:** the doc remains the single source of truth; no parallel mechanism. Round history coherence is preserved without special-casing. The voluntary-leave vs kicked distinction is structural (one field comparison) rather than UI-stateful. Old clients that don't know about `leftAt` degrade gracefully — they keep showing departed participants as offline, which is a worse UX than the new behavior but no worse than today's status quo. Re-join is the natural inverse of the same field write.
**Cons:** every consumer that wants the "active roster" must remember to filter through `isActiveParticipant`. Easy to forget on a new feature; mitigated by funneling all active-roster reads through the `DocService.activeParticipants()` selector. The Yjs op log grows by one extra write per leave/kick, which is negligible at the scale of a planning poker session.

### Option B: Hard-delete via `participants.delete(id)`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Round-history coherence | **Broken** — past `round.votes` references fall back to raw participantId display |
| Snapshot-rejoin behavior | Mixed — late peer sees no record, can't reconstruct the leave |
| Relay impact | None |
| Migration | None |

**Pros:** simplest possible mutation. No filtering discipline needed.
**Cons:** the round-history coherence break is the disqualifying issue. We could repair it by *also* writing a per-round name snapshot at vote time, but that doubles the storage cost and adds a second source of truth for participant names. Soft-delete pays the same total cost in one place. There is also no clean way to distinguish "B left voluntarily" from "B was kicked by host" without storing an out-of-band log — soft-delete encodes both in the same record.

### Option C: Awareness-only signaling (no doc field)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Persistence | None — lost on disconnect |
| Snapshot-rejoin behavior | Broken — late peer cannot tell the participant left |
| Relay impact | None |

**Pros:** truly ephemeral; no schema change.
**Cons:** the same failure mode [ADR-0020](0020-participant-viewer-voter-role.md) §A documented for role-in-awareness: "Role is lost on disconnect/reconnect, forcing re-announcement." Same applies to leave intent. A late-joining peer who pulls the snapshot has no signal that B left. An offline peer reconnecting after a kick has no signal either, and would see B as a normal lobby member until B's awareness entry happens to be absent — at which point B looks indistinguishable from "B's network blipped." Conflates intent with presence.

### Option D: Relay-side ban list + new close code 4007 = removed-by-host

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — relay must track per-room ban set keyed by participantId, refuse upgrades, expose host-auth surface |
| Content-blindness | Violated — relay would need to associate a participantId with an upgrade attempt |
| Migration | New protocol surface, new close code, new persistence consideration |
| Re-join story | Strict — kicked user cannot re-enter without host action |

**Pros:** persistent kick is enforced on the wire; a kicked user cannot re-enter just by typing the room code again. Active socket close is immediate via the new close code.
**Cons:** breaks [ADR-0001](0001-networking-crdt-over-relay.md). The relay would need either (a) a `participantId` query param on the WS upgrade for ban matching, which the relay doesn't currently use, or (b) a ban list keyed by some other identifier (device ID, IP) which both invent a new persistence surface and create a privacy regression. Either approach requires host-auth on the ban-mutation endpoint, which we explicitly deferred per [ADR-0017](0017-password-hashing-drop-invite-only.md) ("No authentication is required on `PATCH` in v1"). The threat being addressed — a determined kicked user re-entering — is the same threat the password-rotation tool already handles. The cost/value ratio at v1 scale is poor.

## Trade-off Analysis

Option A is chosen because it keeps the system's structural posture — Yjs as the single source of truth, content-blind relay, additive optional fields — and pays the round-history coherence cost in one place rather than two. The cost we pay is filtering discipline: every "who is here right now?" read must funnel through `isActiveParticipant`. We mitigate that by exposing exactly one active-roster selector from `DocService` and letting the type system carry the consequence.

Option D's "instant, persistent, wire-enforced kick" is attractive in isolation but doesn't actually solve a problem we have. The real concern is "this person should not be in this meeting." Password rotation already handles that case at the same coarse granularity (per-room, host-controlled, no per-person admission) that the rest of v1 access control operates at. Building a per-participant ban surface to provide finer granularity than any other access mechanism in the product would be inconsistent — and it would force the relay to grow content awareness it deliberately doesn't have.

The decision to skip a new close code 4007 is intentional. The kicked client tears down its own connection in `ParticipantRemovalService` after observing its own removal, exactly the way `SessionEndService` does for session-end. The relay does not need to actively close the socket; the client's teardown is sufficient and faster than waiting for the relay to act. If a future scenario emerges where the relay must terminate a stale socket — e.g., a misbehaving client that ignores its own removal — a successor ADR can introduce 4007 then. Nothing in the current decision precludes it.

The voluntary-leave vs kicked split (`removedBy === self` vs `removedBy !== self`) is the smallest representation that lets observers behave correctly. A single boolean would force the toast wording into out-of-band context; a separate "kick log" would be a second source of truth. Encoding the actor's identity inline keeps the structural cost minimal and gives the UI everything it needs.

The [ADR-0010](0010-host-election.md) interaction is intentionally a non-event. Host election runs against currently-connected peers; once the host's `leftAt` is set, the host is filtered out of `activeParticipants` and election proceeds normally on the remaining online active peers. No special "host left" path is needed — the existing 5-second debounce + lowest-peer-ID rule handles it.

## Consequences

**Easier:**
- "Leave" actually leaves. The lobby roster shrinks for everyone immediately, matching user expectation.
- The host has a cleanup tool for duplicate / mistaken joins, surfaced through the existing UI gates.
- Round history stays coherent — a departed participant's votes still show their name, because the raw map is preserved.
- The unanimous auto-reveal denominator from [ADR-0018](0018-remove-timer-add-unanimous-reveal.md) / [ADR-0020](0020-participant-viewer-voter-role.md) no longer hangs on leavers; a participant who leaves without voting is excluded from the count, so the remaining voters can complete the round.
- Re-join is the natural inverse: a kicked or left user typing the room code clears their `leftAt` via the existing `joinSession` mutation. No special "rejoin" path.
- Schema is additive; old clients keep working with the worse-but-tolerable "leaver appears offline" behavior.

**Harder:**
- Filtering discipline is now load-bearing. A new feature that asks "who is in this session?" must use `activeParticipants`, not the raw `participants`. Forgetting this in a future feature would resurrect the original bug. We mitigate by routing all active-roster reads through `DocService.activeParticipants()` and by typing the result distinctly where practical.
- Persistent kick relies on password rotation. A determined kicked user can re-enter until the host changes the password. This is a documented limitation, not a bug, and it matches the v1 "social not security" stance.
- The CLI ([ADR-0021](0021-cli-package.md)) needs parity for both the `leaveSession` mutation (so `hnch leave` actually marks `leftAt` rather than just exiting) and the `ParticipantRemovalService`-equivalent observer (so a kicked CLI peer toasts and exits cleanly). Until the parity work lands, CLI peers will silently disappear on leave (worse UX) and hang in a host-ended-from-mobile scenario (degraded, matches the [ADR-0023](0023-session-end-broadcast.md) gap).

**Revisit triggers:**
- Real product demand for finer-grained admission control (per-person, persistent across password rotations) → reconsider Option D's relay-side ban list, almost certainly with host-auth tokens, and a successor ADR superseding this one's §6.
- Misbehaving clients ignore their own removal and keep writing to the doc → introduce close code 4007 (`removed-by-host`) and have the relay actively close sockets whose participantId is observed `leftAt` set. This would require the relay to grow some doc awareness, which would itself require a successor to [ADR-0001](0001-networking-crdt-over-relay.md) §content-blindness.
- A future product decision to surface a "recently left" timeline in the lobby → may want a richer leave record (reason, kick category) than two fields; would supersede this ADR's field shape but leave the mechanism intact.
- Filtering discipline drift causes a regression (a feature ships that uses the raw `participants` map for active-roster purposes) → consider hardening with a typed wrapper or a lint rule, but treat as implementation hygiene rather than an ADR-class concern.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry. (Done in this changeset.)
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the soft-delete leave/kick model and the password-rotation persistence-kick pattern.
- [ ] Update [`schema.md`](../schema.md) participants table to document the new `leftAt` and `removedBy` fields, the absent-means-active rule, and the round-history-uses-raw-map invariant.
- [ ] Update `ux.md` — adjust the existing Leave Session entry to reflect that the action now removes the participant from the active roster (not just disconnects locally), and add the host-kick affordance with the confirmation copy.
- [ ] Cross-link from [ADR-0010](0010-host-election.md) (typo-class addition) noting that a host who voluntarily leaves triggers re-election normally because they are filtered out of `activeParticipants`.
- [ ] Cross-link from [ADR-0020](0020-participant-viewer-voter-role.md) (typo-class addition) noting that the auto-reveal denominator from this ADR's §2 is the intersection of online + active + voter.
- [ ] Cross-link from [ADR-0022](0022-last-session-cache.md) (typo-class addition) noting that the last-session cache is cleared as part of both voluntary leave and observed-kick teardown.
- [ ] Cross-link from [ADR-0023](0023-session-end-broadcast.md) (typo-class addition) noting that `ParticipantRemovalService` follows the same observer/idempotency pattern as `SessionEndService`.
- [ ] Implementation tracking is owned by the participant-removal plan; this ADR documents the structural decision only.
- [ ] CLI parity for `leaveSession` and the removal observer is required by the [ADR-0021](0021-cli-package.md) parity contract and is tracked as a Phase 2 follow-up to the implementation plan.
- [ ] Watch for filtering-discipline regressions: any new feature that touches the participant roster must funnel through `DocService.activeParticipants()`, not the raw map. Add to code-review checklist.
