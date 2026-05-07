# ADR-0006: Sessions are ephemeral (one per meeting)

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Core product-shape question: is a session a single-meeting ephemeral room, or a persistent room a team returns to weekly?
- Answer shapes schema, room-code lifecycle, UI (history view?), Yjs doc growth profile.

## Decision

A session is **ephemeral — one per meeting**. Created when host starts; lives meeting duration + snapshot TTL (ADR-0012); discarded. No "rejoin same room next sprint" at session level. Cross-meeting continuity provided by separate local-only **Team** concept (ADR-0007).

## Trade-offs

- No bookmarkable persistent URL — new code each meeting (mitigated by 6-char codes per ADR-0008).
- Team concept (ADR-0007) recovers most "regular crew" benefit without growing-doc cost.
- Cross-meeting analytics not native — export + aggregate externally.

## Consequences

- Easier: small bounded Yjs schema; simple code lifecycle (create → live → retire TTL → release); no past-meeting archive UI; snapshot policy doesn't deal with unbounded state.
- Harder: continuity-seeking teams create new room each meeting (mitigated by ADR-0007 pre-populated defaults).
- Revisit when: feedback explicitly asks for "one link forever" → consider opt-in persistent rooms; partnership/feature needs cross-meeting state (continuous-improvement analytics) → same.
