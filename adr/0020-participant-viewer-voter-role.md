# ADR-0020: Participant Viewer/Voter Role

**Status:** Accepted
**Date:** 2026-04-25
**Deciders:** xau

## Context

`project.md` describes two participant roles — voters (team members who estimate) and viewers (observers such as stakeholders or Scrum Masters who watch without voting). Currently the schema has no `role` field on participant records; every participant is implicitly a voter.

This creates two problems:

1. **Viewers cannot observe without distorting the session.** A stakeholder who joins must either vote (they have no estimate) or go unvoted (which blocks unanimous auto-reveal in ADR-0018, or forces the host to manually reveal every round).

2. **Unanimous auto-reveal is broken for mixed audiences.** ADR-0018 fires `revealedAt` when every online participant has a vote in the current round. Without a viewer concept, the presence of a non-voting observer permanently prevents auto-reveal from firing — even if every actual voter has voted.

Role is meaningful session-state (not just transient presence), so it must survive reconnects and appear in snapshots. This makes it a Yjs doc field, not an awareness field.

## Decision

Add an optional `role` field (`'voter' | 'viewer'`) to each participant's `Y.Map` entry in the `participants` map. Absent means `'voter'` — the field is additive and backward-compatible.

- **Voters** can cast and change votes; they participate in unanimous auto-reveal.
- **Viewers** cannot cast votes (enforced by the client UI); they are excluded from the auto-reveal voter count.
- Any participant (including the host) can switch their own role between voter and viewer mid-session.
- Role is persisted in the doc so peers joining mid-session and clients reconnecting see the correct value without a re-announcement.

## Options Considered

### Option A: Role in awareness (ephemeral)

Store `role` in each client's Yjs awareness entry alongside `participantId`.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Persistence | None — lost on disconnect |
| Snapshot visibility | No |
| Backward compatibility | N/A |

**Pros:** No schema change; purely ephemeral.
**Cons:** Role is lost on disconnect/reconnect, forcing re-announcement. Clients joining mid-session see no role until the user reconnects. Snapshots omit role. Semantically wrong — role is intent, not transient presence.

### Option B: Role in the Yjs doc as an optional field (chosen)

Add `role?: 'voter' | 'viewer'` to each participant's `Y.Map`. Absent = `'voter'` (default).

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Persistence | Full — survives reconnects, included in snapshots |
| Snapshot visibility | Yes |
| Backward compatibility | Yes — additive optional field |

**Pros:** Survives reconnects. Late-joining peers see the correct role. Snapshots capture it. Absent-means-voter keeps existing sessions working without migration.
**Cons:** One more field in the CRDT history per role change event. Negligible at the scales this app operates.

### Option C: Separate `viewers` Y.Map at the doc root

Maintain a top-level `Y.Map` of participant IDs that are viewers; absence means voter.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Persistence | Full |
| Backward compatibility | Yes — new top-level map |

**Pros:** Slightly simpler read path (membership check).
**Cons:** Splits participant metadata across two top-level maps, complicating projection and snapshot logic. Role changes produce writes to two separate CRDT structures.

## Trade-off Analysis

Option B is the minimum additive change that correctly models participant intent. It stores role alongside the participant record where it semantically belongs, keeps the schema coherent, and introduces zero migration burden. The CRDT overhead is negligible. Option A is rejected because a session-level intent should not evaporate on every network blip. Option C is rejected because it fragments participant state for no structural gain.

## Consequences

**Easier:**
- Observers can join sessions without distorting vote counts or blocking auto-reveal.
- Auto-reveal logic (ADR-0018) has a well-defined voter set to check against.
- Snapshots include role, so exported results distinguish voters from viewers.

**Harder:**
- The unanimous auto-reveal check in ADR-0018 must be updated: fire only when every **online voter** (awareness entry whose `participantId` maps to a participant with `role !== 'viewer'`) has a vote in the current round.
- An edge-case guard is now required: if all online participants are viewers (zero voters), unanimous auto-reveal must not fire. This prevents a vacuous trigger in an all-viewer session.
- Client UI must gate the vote casting flow on `role === 'voter'`; the card picker should not appear for viewers.
- `doc-projection.ts` (`projectDoc`) must include `role` in the projected participant snapshot.

**Backward compatibility:** Sessions created before this change have no `role` field on any participant. All existing clients treat absent = `'voter'`, so no migration is needed.

**Revisit triggers:**
- Need for additional roles (e.g. `facilitator`) — extend the union type via a new ADR.
- Host wanting to change another participant's role (currently only self-role-change is in scope) — would require a new UX decision and possibly a host-authority guard.

## Action Items

- [ ] Add `role?: 'voter' | 'viewer'` to the participant `Y.Map` type in `packages/shared/src/doc.ts`
- [ ] Update `doc-projection.ts` to include `role` in the projected participant record (defaulting absent to `'voter'`)
- [ ] Update unanimous auto-reveal logic to count only online voters (`role !== 'viewer'`), and add the zero-voter guard
- [ ] Gate the vote-casting UI on `role === 'voter'` (mobile card picker, CLI vote command)
- [ ] Update `schema.md` participants table to document the `role` field
- [ ] Add tests: projection with missing role, auto-reveal with mixed voter/viewer set, auto-reveal with zero voters
