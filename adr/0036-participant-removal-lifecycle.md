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
4. Mutations in `packages/shared/src/doc.ts`: `leaveSession(doc, selfId)` sets `leftAt`/`removedBy=self`; `removeParticipant(doc, hostId, targetId)` sets fields with `removedBy=hostId`; `joinSession` extended to clear both on re-entry. Host check client-side per [ADR-0023](0023-session-end-broadcast.md) §4.
5. `ParticipantRemovalService` observer mirrors `SessionEndService`: on self transition to `leftAt` set with `removedBy !== self` → toast "Removed by host", tear down doc binding + provider, drop [ADR-0022](0022-last-session-cache.md) cache, navigate Home (CLI: exit). Idempotent.
6. No relay-side ban list, no new close code. Re-entry clears `leftAt` via `joinSession`. Persistent removal = host rotates password (`PATCH /rooms/:uuid/access` per [ADR-0017](0017-password-hashing-drop-invite-only.md)). Matches v1 "social problem, not security boundary" stance.
7. Concurrency unchanged. Yjs LWW handles vote-during-kick races + concurrent host kicks (logical clock + clientID tiebreak, same as `sessionEndedAt` per [ADR-0023](0023-session-end-broadcast.md) §3).

## Options

- **A — Soft-delete `leftAt` + `removedBy` (CHOSEN):** doc = single source of truth; round-history coherence preserved; additive + backward-compat; voluntary-vs-kicked distinction structural. Cons: filtering discipline now load-bearing — every "active roster" read must funnel through `isActiveParticipant`. Mitigated via `DocService.activeParticipants()` selector.
- **B — Hard-delete `participants.delete(id)`:** simplest mutation. Cons: round-history coherence broken — past votes fall back to raw participantId display. Could repair via per-round name snapshot at vote time but that doubles storage + creates 2nd source of truth. No clean voluntary-vs-kicked distinction without out-of-band log. Rejected.
- **C — Awareness-only signaling:** truly ephemeral, no schema change. Cons: same failure mode [ADR-0020](0020-participant-viewer-voter-role.md) §A flagged for role-in-awareness — lost on disconnect; late peer + reconnecting offline peer cannot tell leave from network blip. Conflates intent with presence. Rejected.
- **D — Relay-side ban list + close code 4007:** wire-enforced persistent kick. Cons: breaks [ADR-0001](0001-networking-crdt-over-relay.md) (relay must associate participantId with upgrade); requires host-auth on ban mutations (deferred per [ADR-0017](0017-password-hashing-drop-invite-only.md)); password rotation already solves the same problem at the same coarse granularity. Rejected on cost/value at v1 scale.

## Trade-offs

- Filtering discipline load-bearing — new feature touching roster must use `activeParticipants`, not raw map. Mitigated by single selector + typed result.
- Persistent kick relies on password rotation. Determined kicked user can re-enter until password changes. Documented v1 limit.
- CLI ([ADR-0021](0021-cli-package.md)) needs parity for `leaveSession` mutation + removal observer; until landed, CLI peers silently disappear on leave + hang on host-end-from-mobile (matches existing [ADR-0023](0023-session-end-broadcast.md) gap).
- Host election ([ADR-0010](0010-host-election.md)) interaction is non-event: leaving host filtered out → 5-sec debounce + lowest-peer-ID proceeds normally on remaining online active peers.

## Consequences

- Easier: Leave actually leaves; host has cleanup tool; round history coherent; unanimous auto-reveal denominator no longer hangs on leavers; re-join is natural inverse of `leaveSession`; schema additive — old clients tolerable degraded (leaver-as-offline).
- Harder: filtering discipline; persistent kick = password-rotation-only; CLI parity work pending.
- Revisit when: real demand for finer admission control (per-person, persistent across rotations) → reconsider Option D w/ host-auth tokens; misbehaving clients ignore own removal + keep writing → introduce close 4007 (requires successor to [ADR-0001](0001-networking-crdt-over-relay.md) §content-blindness); demand for richer leave record (reason, kick category) → supersede field shape, keep mechanism; filtering-discipline regression ships → harden via typed wrapper or lint, treat as hygiene not ADR.

## Action Items

- [ ] Update `CLAUDE.md` glance, [`schema.md`](../schema.md) participants table, `ux.md` Leave + host-kick.
- [ ] Cross-link from [ADR-0010](0010-host-election.md), [ADR-0020](0020-participant-viewer-voter-role.md), [ADR-0022](0022-last-session-cache.md), [ADR-0023](0023-session-end-broadcast.md) (typo-class).
- [ ] CLI parity for `leaveSession` + removal observer (Phase 2 follow-up per [ADR-0021](0021-cli-package.md)).
- [ ] Code-review checklist: roster reads must use `DocService.activeParticipants()`.
