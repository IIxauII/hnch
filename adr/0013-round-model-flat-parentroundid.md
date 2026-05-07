# ADR-0013: Round model — flat list with parentRoundId linking

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Planning poker estimates "items"; each item runs one or more rounds (vote → reveal → discuss → maybe re-vote).
- Data model must represent rounds plus re-vote relationships. Affects Yjs doc shape, round-history UI, exports, analytics.
- Related question: can a participant change their vote pre-reveal? Same design area — affects what "the vote" means in a round record.

## Decision

Rounds stored as flat Y.Array in Yjs doc; each round top-level with own metadata + per-participant votes. Re-vote = new round with `parentRoundId` pointing at predecessor; title/metadata default to parent. Vote change allowed any number of times until reveal — selection at reveal time counts.

## Options

- **A — Flat rounds + optional parentRoundId (chosen):** simplest doc shape; lineage explicit and cheap to traverse; no formal "close item" step; re-vote progression preserved for retros. Cons: item-level metadata requires walking chain to aggregate.
- **B — Items contain rounds (nested):** items first-class with own metadata; richer semantics. Cons: requires explicit item creation or implicit-on-first-round; nested Yjs schema (Array→Map→Array); more UI navigation; more complex sync/merge.
- **C — Flat rounds, re-vote overwrites:** simplest doc, fewest history entries. Cons: irreversibly loses progression — exactly the data retros need.
- **D — Two-tier with "current item" pointer:** lets UI show "voting on Item X" as session field. Cons: ephemeral pointer adds no expressiveness over chain-walking; concept without value.

## Trade-offs

- Item-level UI surfaces require chain-walking aggregation.
- Schema evolution → if items later promoted to first-class (B), migration non-trivial.
- Vote-change-before-reveal matches physical planning poker; locking on first submission would surprise users.

## Consequences

- Easier: flat Y.Array; trivial sync/merge at round level; one-tap re-vote; exports flat or grouped by chain root.
- Harder: aggregating across re-vote chains for item-level reporting; future migration to nested model.
- Revisit when: users request item-level reporting (aggregate estimate, per-item outcomes) → consider B via superseding ADR. Round-count UI bloat → pagination/grouping, not schema change.

## Action Items

- [ ] Round record schema: `{ id, title?, description?, ticketId?, scale, parentRoundId?, timerStartedAt?, votes: Y.Map<peerId, card>, revealedAt? }`.
- [ ] Re-vote action: new round with `parentRoundId`, title inherited.
- [ ] Vote-change behavior: tap different card overwrites pre-reveal selection.
- [ ] Export format (clipboard + markdown) — UX choice, not schema.
