# ADR-0020: Participant Viewer/Voter Role

**Status:** Accepted
**Date:** 2026-04-25

## Context

- `project.md` defines voters (estimators) + viewers (observers — stakeholders, Scrum Masters).
- Schema lacks `role` on participant records — every peer implicitly voter.
- Viewers either vote falsely or block ADR-0018 unanimous auto-reveal (stuck with no estimate).
- Mixed audiences break auto-reveal: any non-voting observer permanently prevents fire.
- Role is session-state intent, not transient presence — must survive reconnects + appear in snapshots → Yjs doc field, not awareness.

## Decision

Add optional `role: 'voter' | 'viewer'` to each participant `Y.Map` entry. Absent = `'voter'` (additive, backward-compatible). Voters cast votes + count toward auto-reveal; viewers cannot vote (UI-gated) + excluded from voter denominator. Self-toggle mid-session.

## Trade-offs

- Auto-reveal logic gains complexity: must filter online voters, guard zero-voter case (all-viewer session must not vacuously fire).
- Card-picker UI must gate on role.
- Projection (`doc-projection.ts`) must include `role`, defaulting absent to `'voter'`.

## Consequences

- Easier: observers join without distorting votes or blocking reveal; auto-reveal has well-defined denominator; snapshots distinguish roles.
- Harder: auto-reveal check + zero-voter guard required; UI gating; projection update.
- Backward compatible: pre-change sessions have no `role`; absent = voter, no migration.
- Revisit when: more roles needed (e.g. `facilitator`) → extend union via new ADR; host changing other peers' roles → new UX + host-authority guard.
