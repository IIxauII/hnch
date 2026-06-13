# ADR-0048: Host election eligible peer set — online ∩ active, single-sourced

**Status:** Accepted
**Date:** 2026-06-13

Refines ADR-0010 §3. Builds on ADR-0036 (participant removal) and ADR-0021 (CLI parity).

## Context

- ADR-0010 §3: new host = lex-lowest device ID "among connected peers". Written before ADR-0036; silent on the kicked-but-lingering case.
- ADR-0036: a kicked participant keeps its awareness entry until the socket drops, while `leftAt` is set in the doc. Under ADR-0010's literal "connected peers", such a peer can win or block an election.
- Election logic was hand-copied into both consumers (`cli/src/host-election.ts`, `client/.../host-election.service.ts`). The copies drifted: client intersects awareness with active participants; CLI did not — a live parity defect.

## Decision

- Eligible peer set for election = **online ∩ active**: awareness set ∩ `!leftAt`. A peer with `leftAt` set is excluded; it can neither win nor block, even while its awareness entry lingers.
- Election logic single-sourced as pure decision functions in `packages/shared/src/election.ts` (`evaluateElection`, `resolvePromotion`), consumed by both client and CLI per ADR-0021 parity. Functions take the shared `DocProjection` + raw awareness `onlineIds` + `myId`; the intersection happens inside, once.
- Debounce timer, `missingHostId` state, and the doc write stay in each consumer's driver (Angular effect / `setTimeout` + Y observers). Drivers feed inputs and apply the returned action; they hold no branch logic.

## Trade-offs

- Reducer couples to `DocProjection` shape — acceptable; it is already the shared domain view.
- "Only winner writes" rule moves into `resolvePromotion` (takes `myId`) — centralizes parity at the cost of the reducer knowing the caller's identity.

## Consequences

- Easier: one election rule, one test surface (table-driven, no timers/fakes); kicked-lingering defect fixed for both consumers; ADR-0036 honored by construction.
- Harder: a consumer's driver must build the awareness `onlineIds` set and supply the live projection each evaluation.
- Revisit when: signed host claims (ADR-0010 revisit) or explicit baton-pass handoff land — both change what `resolvePromotion` decides.
