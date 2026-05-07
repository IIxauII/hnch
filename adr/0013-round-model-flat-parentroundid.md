# ADR-0013: Round model — flat list with parentRoundId linking

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Planning poker estimates "items"; each item runs one or more rounds (vote → reveal → discuss → maybe re-vote).
- Data model must represent rounds plus re-vote relationships. Affects Yjs doc shape, round-history UI, exports, analytics.
- Related question: can a participant change their vote pre-reveal? Same design area — affects what "the vote" means in a round record.

## Decision

Rounds stored as flat Y.Array in Yjs doc; each round top-level with own metadata + per-participant votes. Re-vote = new round with `parentRoundId` pointing at predecessor; title/metadata default to parent. Vote change allowed any number of times until reveal — selection at reveal time counts. Round record schema: `{ id, title?, description?, ticketId?, scale, parentRoundId?, timerStartedAt?, votes: Y.Map<peerId, card>, revealedAt? }`.

## Trade-offs

- Item-level UI surfaces require chain-walking aggregation.
- Schema evolution → if items later promoted to first-class (nested items-contain-rounds), migration non-trivial.
- Vote-change-before-reveal matches physical planning poker; locking on first submission would surprise users.

## Consequences

- Easier: flat Y.Array; trivial sync/merge at round level; one-tap re-vote; exports flat or grouped by chain root.
- Harder: aggregating across re-vote chains for item-level reporting; future migration to nested model.
- Revisit when: users request item-level reporting (aggregate estimate, per-item outcomes) → consider nested via superseding ADR. Round-count UI bloat → pagination/grouping, not schema change.
