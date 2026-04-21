# ADR-0006: Sessions are ephemeral (one per meeting)

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

A fundamental product-structure question: is a hnch "session" an ephemeral room created for a single estimation meeting, or a persistent room that a team returns to week after week? The answer shapes the schema, the room-code lifecycle, the UI (does it need a "history of past meetings" view?), and whether the Yjs document is expected to grow over months or only over hours.

## Decision

A session is **ephemeral — one per meeting**. It is created when a host starts an estimation session, lives for the duration of that meeting plus a snapshot TTL window afterward (see ADR-0012), and is discarded. There is no concept of "rejoin the same persistent room next sprint" at the session level — teams create a new session each meeting. Continuity across meetings is provided by the **Team** concept (see ADR-0007), which is a separate, local-only layered construct.

## Options Considered

### Option A: Ephemeral per-meeting sessions (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Low |
| Scalability | Excellent — doc stays small |
| Team familiarity | Matches tools like Scrumpoker.online |

**Pros:** crisp mental model; Yjs doc stays bounded in size; no "today vs. history" UI problem; room codes can be short because they don't need to be memorable long-term; no server-side state to manage across meetings.
**Cons:** no single URL a team can bookmark and return to each week — they must create a new room each time and share a new code.

### Option B: Persistent team rooms

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Low but growing over time |
| Scalability | Doc grows indefinitely |
| Team familiarity | Matches tools like Parabol |

**Pros:** a team bookmarks one link and returns to it; round history accumulates as a real record; "this is our estimation room" makes the product feel more like a team tool.
**Cons:** Yjs doc grows without bound (need pruning, archiving, or subdocs); UI must separate "this meeting" from "past meetings"; room codes become semi-permanent identifiers that need to be memorable; server needs to hold state long-term (conflicts with the ephemeral snapshot model in ADR-0012).

### Option C: Both — default ephemeral with opt-in "save this room"

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | Carries both models' costs |
| Scalability | Mixed |
| Team familiarity | Familiar from "save this chat" UX in other tools |

**Pros:** maximum flexibility; users who want persistence can opt in.
**Cons:** two kinds of rooms in the data model, two UX flows, doubled complexity; the v1 version of any product rarely benefits from carrying two abstractions simultaneously.

## Trade-off Analysis

We chose A primarily to keep the v1 scope tight and the data model crisp. The loss is narrow — a team that wants continuity creates a new room each meeting, which is fast (ADR-0008 codes are 6 characters). The Team concept (ADR-0007) recovers most of the "this is our regular crew" benefit that B would provide, without any of the growing-doc cost.

Persistent rooms (B) are attractive in theory but oversized for a planning poker app. Teams do other things between estimation meetings (standups, retros, demos) and those don't happen in hnch, so treating the hnch room as a long-lived space doesn't match real usage. Making everything both (C) would mean committing to more design surface than we're ready for at v1.

## Consequences

**Easier:**
- Yjs doc schema stays small and bounded.
- Room code lifecycle is simple: create, live, retire for TTL, release.
- No "archive of past meetings" UI to build in v1.
- Snapshot policy (ADR-0012) doesn't have to deal with indefinitely-growing state.

**Harder:**
- Teams who want continuity need to create a new room each meeting (partially mitigated by ADR-0007's Team concept which can pre-populate defaults).
- Cross-meeting analytics ("how did our estimates improve over sprints") are not supported natively — users would export and aggregate externally.

**Revisit triggers:**
- User feedback explicitly asking for "one link our team uses forever" → consider Option C (ephemeral default + opt-in persistent).
- A partnership or feature need requiring cross-meeting state (e.g. continuous improvement analytics baked in) → same.

## Action Items

- [ ] Remove the stale `project.md` line *"Sessions never auto-expire; users manage their own storage"* if it hasn't been already (already done in this decision pass — verify).
- [ ] Ensure the "create session" UX makes it instant — one tap from home → new session exists with code visible to share. This is the primary UX compensation for ephemerality.
