# ADR-0013: Round model — flat list with parentRoundId linking

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

Planning poker involves estimating "items" (usually stories, tickets, or tasks). For each item, the team runs one or more "rounds" of voting: everyone picks a card, all cards are revealed, discussion happens, and sometimes a re-vote is run to converge on a consensus estimate.

The data model has to represent both rounds and the relationship between rounds that are re-votes of the same underlying item. The choice affects the Yjs doc shape, the round-history UI, and how exports and analytics are generated.

Relatedly: can a participant change their vote before the reveal? The answer sits in the same design area because it affects what "the vote" means in a round record.

## Decision

Rounds are stored as a **flat list** in the Yjs doc. Each round is a top-level entity with its own metadata (title, description, ticket ID), its own per-participant votes, and its own analytics. Re-votes are represented by creating a **new round with `parentRoundId`** pointing at the previous round; the title and metadata default to the parent's values.

The UI walks the parent chain to render lineage like *"Round 2 of 3 on 'Auth migration'"* without requiring any nested data structure.

**Vote change before reveal:** a participant may change their vote any number of times by tapping a different card. The selection at reveal time is what counts. Matches physical planning poker where you can flip your card back over before everyone shows.

## Options Considered

### Option A: Flat rounds with optional parentRoundId (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Expressiveness | Adequate — lineage preserved |
| Team familiarity | Standard |

**Pros:** simplest Yjs doc shape — a single flat array of rounds; lineage is explicit and cheap to traverse; no formal "close this item" step for the host to remember; re-vote progression (5 → 8 → 13) is preserved for retrospective value; exports and analytics can easily group by lineage chain or treat rounds independently as desired.
**Cons:** "what item is this a round of" is indirect — derived from the chain root rather than an explicit item record; adding item-level metadata (e.g., story owner, estimate consensus over time) requires walking the chain to aggregate.

### Option B: Items contain rounds (nested)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Expressiveness | Highest — items are first-class |
| Team familiarity | Standard |

**Pros:** items are explicit first-class entities with their own metadata; rich semantics for "how many re-votes did this item need" without walking chains; natural place to hang item-level state (final consensus, skipped, etc.).
**Cons:** requires the host to formally "create an item" before voting on it, or implicitly-create-item-on-first-round logic; more nested schema in Yjs (Y.Array of Y.Maps of Y.Arrays); more UI to navigate (item list → round list); slightly more complex sync and merge behavior.

### Option C: Flat rounds, re-vote overwrites current

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Cost | None |
| Expressiveness | Lossy |
| Team familiarity | Standard |

**Pros:** simplest possible doc; fewest rounds in history to scroll.
**Cons:** loses the progression across re-votes, which is exactly the interesting history for retrospectives ("it took us 3 rounds to converge on 5, because Bob kept voting 13"); irreversible loss of data.

### Option D: Two-tier with rounds under an explicit "current item" pointer

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Expressiveness | Middle ground |
| Team familiarity | Standard |

**Pros:** lets the UI show "we are currently voting on Item X" as a first-class session-level field.
**Cons:** the "current item" pointer is ephemeral session state; using a pointer is no more expressive than walking a chain from the most recent round; adds concept without adding value.

## Trade-off Analysis

Option A is the minimum that preserves the re-vote lineage we care about for retrospectives and exports, without introducing item-level complexity that doesn't earn its weight at v1. Option B is the richer model, but we don't yet have a compelling reason to make items first-class — most of the benefit (title inheritance, progression display, export grouping) is available from A with a single extra field.

Vote-change-before-reveal matches physical planning poker and is the less surprising behavior for users. Locking on first submission would be a surprising UX regression.

## Consequences

**Easier:**
- Yjs doc shape is simple: a flat Y.Array of round records.
- Sync and merge are trivially correct at the round level.
- Re-vote flow is a one-tap action: "re-vote" creates a new round with `parentRoundId` and inherits title.
- Export logic can either list rounds independently (flat) or group by chain root (lineage grouping).

**Harder:**
- "Item-level" UI surfaces (if we ever want them) require walking chains to aggregate.
- Schema evolution: if we later decide items should be first-class (Option B), migrating existing round records to a nested structure is possible but non-trivial. Worth keeping in mind when we version the doc.

**Revisit triggers:**
- Users asking for item-level reporting (aggregate estimate across all rounds of an item, or per-item outcomes like "skipped / consensus / deferred") → consider upgrading to Option B with a superseding ADR.
- Growing round count per session becoming unwieldy in the UI → address with pagination or grouping, not schema change.

## Action Items

- [ ] Design the round record schema in the Yjs doc: `{ id, title?, description?, ticketId?, scale, revealMode, timerDurationMs?, parentRoundId?, timerStartedAt?, votes: Y.Map<peerId, card>, revealedAt? }`.
- [ ] Implement the re-vote UI action: creates a new round with `parentRoundId` pointing at the current round, title inherited.
- [ ] Implement the "change your vote" behavior: tapping a different card overwrites the previous selection pre-reveal.
- [ ] Decide the export format (clipboard + markdown) in a follow-up — whether it shows lineage chains or flat rounds is a UX choice, not a schema choice.
