# ADR-0007: Teams as a local-only layered concept

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

ADR-0006 establishes that sessions are ephemeral per meeting. That leaves a real user need unresolved: "I estimate with the same five people every sprint — I'd rather not recreate my defaults and resend the link each time." A concept of "my usual crew" is valuable.

The question is where a Team lives, who owns it, and whether it's a shared entity synced between members.

## Decision

A **Team** is a device-local, personal, saved collection of "people I usually estimate with" plus optional default session settings (preferred estimation scale, reveal mode, timer duration). Teams are stored in each user's local Capacitor Preferences / SQLite (see ADR-0004) and are **not** synced via Yjs. Each user maintains their own Team definitions; there is no canonical shared team entity.

Creating a session "with Team X" is a UX convenience that pre-populates expected attendees and applies the saved default settings. It does not make the session itself persistent — the session remains ephemeral per ADR-0006.

## Options Considered

### Option A: Local-only Teams per device (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None — uses existing local storage |
| Scalability | N/A — per-device |
| Team familiarity | Standard |

**Pros:** no backend, no sync layer, no identity-persistence requirement; aligns with the accountless principle; each user customizes their own Team view without cross-user coordination; no cross-device sync headaches.
**Cons:** Bob and Carol each have their own "Platform Squad" Team, and they may drift (Bob adds a new engineer, Carol doesn't); no shared notion of "who's on the team" — it's each person's mental model of it.

### Option B: Teams as shared Yjs entities

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | Additional Yjs doc(s) to sync |
| Scalability | OK |
| Team familiarity | Standard |

**Pros:** one shared team definition; everyone sees the same roster; adding a new member propagates.
**Cons:** shared state requires some home for it outside any single session (conflicts with ADR-0006's ephemeral model); would need a separate always-connected sync for Teams; implicitly reintroduces persistent shared data, which is what we deliberately avoided; requires stable cross-device identity (see ADR-0005 caveats) to recognize "same person" across Team instances.

### Option C: Server-stored Teams

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | Adds a database to the relay |
| Scalability | Good |
| Team familiarity | Standard |

**Pros:** shared, durable, visible to all members; classic team-tool semantics.
**Cons:** reintroduces a stateful server with real data, which is exactly what ADR-0001 and the privacy principles avoided; requires accounts or at least strong cross-device identity, which we haven't built.

### Option D: No Teams — users just re-enter defaults each time

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Cost | None |
| Scalability | N/A |
| Team familiarity | Standard |

**Pros:** simplest product.
**Cons:** real user pain — repeatedly configuring the same scale, reveal mode, timer every session is annoying for a tool used by the same people weekly.

## Trade-off Analysis

Local-only (A) recovers most of the user benefit of a "team" concept (faster session creation, saved defaults, familiar roster) without any of the architectural cost of shared state (B, C). The loss is that each user's Team view may drift from their colleagues', but in practice this is minor: the Team is mainly a personal bookmark for settings and reminders, not the canonical roster. The actual session roster is whoever shows up.

B and C were explicitly rejected because they contradict ADR-0001 and ADR-0005 — we'd be reintroducing exactly the architectural layers we chose to avoid. D leaves the user pain unaddressed; we can do better cheaply.

## Consequences

**Easier:**
- No new sync layer for Team state.
- No cross-device identity requirement.
- Each user gets a personalized experience without coordination.

**Harder:**
- Cannot say "invite my team" and have it magically notify everyone — it just pre-populates what the user sees when creating a room.
- If users expect team rosters to agree across devices, we'll need to educate them or eventually add opt-in sync.

**Revisit triggers:**
- Consistent feedback that "my team is out of sync with my teammate's view of our team" → consider opt-in Team sync, possibly via a shareable Team export/import rather than continuous sync.

## Action Items

- [ ] Design the Team schema for local storage (separate from the Yjs session doc): id, name, member entries (nickname + last-seen device ID), default settings.
- [ ] Plan the "start session with Team X" flow: create an ephemeral session, apply Team defaults, optionally show an expected-attendees list in the lobby.
- [ ] Document the Team concept in `project.md` (already done in the recent update).
