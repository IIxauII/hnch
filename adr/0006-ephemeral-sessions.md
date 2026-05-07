# ADR-0006: Sessions are ephemeral (one per meeting)

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Core product-shape question: is a session a single-meeting ephemeral room, or a persistent room a team returns to weekly?
- Answer shapes schema, room-code lifecycle, UI (history view?), Yjs doc growth profile.

## Decision

A session is **ephemeral — one per meeting**. Created when host starts; lives meeting duration + snapshot TTL (ADR-0012); discarded. No "rejoin same room next sprint" at session level. Cross-meeting continuity provided by separate local-only **Team** concept (ADR-0007).

## Options

- **A — Ephemeral per-meeting (chosen):** Pros: crisp model; bounded Yjs doc; no today-vs-history UI; short room codes (no long-term memorability); no server cross-meeting state. Cons: no bookmarkable persistent URL — new code each meeting.
- **B — Persistent team rooms:** Pros: bookmark one link; round history accumulates; feels like a team tool (Parabol-style). Cons: doc grows unbounded (need pruning/archive/subdocs); UI must split this-meeting vs past; codes become semi-permanent identifiers needing memorability; conflicts with ephemeral snapshot model (ADR-0012).
- **C — Both, default ephemeral with opt-in "save room":** Pros: max flexibility; opt-in persistence. Cons: two room kinds in data model; two UX flows; doubled complexity; v1 rarely benefits from carrying two abstractions.

## Trade-offs

- Loss is narrow — new room each meeting is fast (6-char codes per ADR-0008).
- Team concept (ADR-0007) recovers most "regular crew" benefit without growing-doc cost.
- Persistent rooms oversized — teams do standups/retros/demos elsewhere; hnch room not naturally long-lived.

## Consequences

- Easier: small bounded Yjs schema; simple code lifecycle (create → live → retire TTL → release); no past-meeting archive UI; snapshot policy doesn't deal with unbounded state.
- Harder: continuity-seeking teams create new room each meeting (mitigated by ADR-0007 pre-populated defaults); cross-meeting analytics not native — export + aggregate externally.
- Revisit when: feedback explicitly asks for "one link forever" → consider C; partnership/feature needs cross-meeting state (continuous-improvement analytics) → same.

## Action Items

- [ ] Verify removal of stale `project.md` line *"Sessions never auto-expire; users manage their own storage"*.
- [ ] "Create session" UX must be one-tap: home → new session with shareable code visible. Primary UX compensation for ephemerality.
