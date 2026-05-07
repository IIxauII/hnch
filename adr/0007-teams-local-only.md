# ADR-0007: Teams as a local-only layered concept

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0006 makes sessions ephemeral per meeting.
- Real need: "I estimate with the same five people every sprint" — saved roster + defaults.
- Open question: where does Team live, who owns it, is it shared.

## Decision

A **Team** is a device-local saved collection of usual collaborators plus default session settings (scale, reveal mode, timer). Stored in each user's local Capacitor Preferences / SQLite (ADR-0004); not synced via Yjs. "Start with Team X" is UX convenience that pre-populates the lobby; the session itself stays ephemeral. Local-only chosen over shared/server alternatives — aligns with accountless principle, zero infra, no cross-device identity needed.

## Trade-offs

- Each user's Team view may drift from teammates' — Team is a personal bookmark, not canonical roster. Actual session roster = whoever shows up.
- "Invite my team" cannot magically notify everyone — only pre-populates local UI.

## Consequences

- Easier: no new sync layer, no cross-device identity requirement, personalized UX without coordination.
- Harder: educate users that Teams are personal; no shared roster guarantee.
- Revisit when: consistent feedback that Team views drift between teammates → consider opt-in Team export/import or sync.
