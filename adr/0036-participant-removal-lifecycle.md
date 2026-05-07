# ADR-0036: Participant removal lifecycle (voluntary leave + host kick)

**Status:** Accepted
**Date:** 2026-04-30

## Context

- `participants` Y.Map cumulative since [ADR-0006](0006-ephemeral-sessions.md); entries added on join, never removed.
- "Leave Session" only disconnects local socket → leaver appears greyed-out + still-present to peers.
- Host has no removal tool — duplicate / mistaken joins stuck until snapshot TTL ([ADR-0012](0012-snapshot-policy.md)) or room abandoned.
- Naive `participants.delete(id)` breaks round history: past `round.votes` reference participants by ID; vote-results / round-history UIs do live name lookup → falls back to raw IDs for departed users.
- Relay content-blind per [ADR-0001](0001-networking-crdt-over-relay.md); cap close codes ([ADR-0024](0024-participant-cap.md)) limited to upgrade-time. Removal must travel via Yjs doc + client observation, mirror [ADR-0023](0023-session-end-broadcast.md). No relay-side removal command.

## Decision

1. Soft-delete via two new optional fields on Participant record: `leftAt: number` (wall-clock ms), `removedBy: string` (actor's participantId). `removedBy === self` ⇒ voluntary leave; `removedBy !== self` ⇒ host kick; absent `leftAt` ⇒ active.
2. `isActiveParticipant(p) = !p.leftAt` helper in `@hnch/shared` is single choke point. Lobby roster, online intersection, unanimous auto-reveal denominator ([ADR-0018](0018-remove-timer-add-unanimous-reveal.md) + [ADR-0020](0020-participant-viewer-voter-role.md)), "didn't vote" set all filter through it. **Round history reads raw map** — names still resolve for departed users.
3. Tab close / network drop / non-intentional disconnect do NOT set `leftAt` — handled by Yjs awareness as today. Preserves [ADR-0022](0022-last-session-cache.md) "Jump back in" reversible-leave model.
4. Mutations in `packages/shared/src/doc.ts`: `leaveSession(doc, selfId)` sets `leftAt`/`removedBy=self`; `removeParticipant(doc, hostId, targetId)` sets fields with `removedBy=hostId`; `joinSession` extended to clear both on re-entry. Host check client-side per [ADR-0023](0023-session-end-broadcast.md).
5. `ParticipantRemovalService` observer mirrors `SessionEndService`: on self transition to `leftAt` set with `removedBy !== self` → toast "Removed by host", tear down doc binding + provider, drop [ADR-0022](0022-last-session-cache.md) cache, navigate Home (CLI: exit). Idempotent.
6. No relay-side ban list, no new close code. Re-entry clears `leftAt` via `joinSession`. Persistent removal = host rotates password (`PATCH /rooms/:uuid/access` per [ADR-0017](0017-password-hashing-drop-invite-only.md)). Matches v1 "social problem, not security boundary" stance.
7. Concurrency unchanged. Yjs LWW handles vote-during-kick races + concurrent host kicks (logical clock + clientID tiebreak, same as `sessionEndedAt` per [ADR-0023](0023-session-end-broadcast.md)).

## Trade-offs

- Filtering discipline load-bearing — every "active roster" read must funnel through `isActiveParticipant` / `DocService.activeParticipants()`. New feature touching roster must use selector, not raw map.
- Persistent kick relies on password rotation. Determined kicked user can re-enter until password changes. Documented v1 limit.
- CLI ([ADR-0021](0021-cli-package.md)) needs parity for `leaveSession` mutation + removal observer; until landed, CLI peers silently disappear on leave + hang on host-end-from-mobile (matches existing [ADR-0023](0023-session-end-broadcast.md) gap).
- Host election ([ADR-0010](0010-host-election.md)) interaction is non-event: leaving host filtered out → 5-sec debounce + lowest-peer-ID proceeds normally on remaining online active peers.
- Hard-delete rejected: round-history coherence broken — past votes fall back to raw participantId display; no clean voluntary-vs-kicked distinction.
- Awareness-only signaling rejected: lost on disconnect; conflates intent with presence; same failure mode [ADR-0020](0020-participant-viewer-voter-role.md) flagged for role-in-awareness.
- Relay-side ban list + close 4007 rejected: breaks [ADR-0001](0001-networking-crdt-over-relay.md) content-blindness; requires host-auth on ban mutations; password rotation already solves at same coarse granularity.

## Consequences

- Easier: Leave actually leaves; host has cleanup tool; round history coherent; unanimous auto-reveal denominator no longer hangs on leavers; re-join is natural inverse of `leaveSession`; schema additive — old clients tolerable degraded (leaver-as-offline).
- Harder: filtering discipline; persistent kick = password-rotation-only; CLI parity work pending.
- Revisit when: real demand for finer admission control (per-person, persistent across rotations) → reconsider relay-side ban w/ host-auth tokens; misbehaving clients ignore own removal + keep writing → introduce close 4007 (requires successor to [ADR-0001](0001-networking-crdt-over-relay.md) content-blindness); demand for richer leave record (reason, kick category) → supersede field shape, keep mechanism.
