# ADR-0046: Round record — three terminal fields + discard tombstone

**Status:** Accepted
**Date:** 2026-05-23

Supersedes [ADR-0013](0013-round-model-flat-parentroundid.md).

## Context

- ADR-0013 specified two terminal fields on a round: `revealedAt` (round produced a vote result) and, via [ADR-0040](0040-skipped-rounds.md), `skippedAt` (host chose not to estimate). The flat-list-plus-`parentRoundId` model is unchanged and load-bearing.
- The host needs a third exit from Estimating that is neither reveal nor skip: leave the in-flight round without producing a history entry and without consuming the linked agenda item. ADR-0040 explicitly carves skip as a history-recording terminal action with a `skippedAt` chip in the round list — overloading skip would muddy that contract and surface "ghost skips" the host did not intend.
- The Estimating back chevron previously navigated to Lobby but Lobby's auto-nav effect bounced any non-terminal `currentRound()` straight back into Estimating, leaving the host with no working soft-exit during an active round. See issue #299.
- Hard-deleting the round from the `Y.Array` (the original proposal) was rejected: it breaks the "no Y.Array removals" pattern set by [ADR-0036](0036-participant-removal-lifecycle.md), strands `parentRoundId` references, and offers no audit trail.

## Decision

Round record carries three mutually-exclusive (at the writer) terminal fields:

```
revealedAt?: number     // host or unanimous auto-reveal
skippedAt?: number      // host skip (ADR-0040)
discardedAt?: number    // host back-chevron tombstone (new)
discardedBy?: string    // peerId of the host that discarded
```

`terminalState(round)` returns `'revealed' | 'skipped' | 'discarded' | null`. On a CRDT merge that lands multiple terminal fields the earliest timestamp wins; on a literal tie the priority order is `revealed > skipped > discarded` so a 1ms-late discard loses to a contemporaneous reveal. All consumers branching on round end state must funnel through `terminalState()`.

Discarded rounds are tombstones:
- `currentRound()` skips rounds with any terminal field and, when no active round exists, falls back to the last NON-DISCARDED round (never returns a discard as the lobby's "last result" anchor).
- Round-history projections exclude discarded rounds.
- `resolveRoundLineage()` filters discarded rounds out of `chainRoot`/descendant walks so re-vote breadcrumbs do not traverse tombstones.
- `appendRound` rejects a `parentRoundId` that points at a discarded round (writer guard); CRDT merges that produce such a reference are still filtered at the projection layer.
- Linked agenda item (if any) stays `pending` and is re-startable — see [ADR-0045](0045-agenda-consume-at-round-terminal.md).

Votes cast concurrently with a discard land in the round's `votes` map but are projection-ignored (the round never resurfaces as active or in history). `castVote` does NOT guard on `discardedAt` — same minimal-guard precedent as ADR-0040 for skip.

Vote-change-before-reveal and the flat-list-plus-`parentRoundId` model from ADR-0013 are preserved verbatim. This ADR restates the round record to add the third terminal field and codify the tombstone semantics; it does not change re-vote lineage shape, scale resolution, or vote storage.

## Trade-offs

- Discarded rounds stay in the doc and count toward the 24h relay snapshot footprint. Bounded in practice — discard is a manual host action triggered by a finger tap. No projection hot path scales with the tombstone count beyond `currentRound()`'s O(rounds) scan, which already existed.
- A third terminal field expands the `terminalState()` truth table from 2² to 2³. Tie-break stays a simple earliest-wins comparator with a stable kind preference on literal ties; the test suite covers the full matrix.
- The host-back-chevron gesture is now load-bearing: a misclick discards an in-flight round. Acceptable cost — voter/viewer chevron is gated to only appear when a round has already reached a terminal state, so non-hosts cannot accidentally tombstone a round.

## Consequences

- Easier: host can exit Estimating mid-round without leaving an orphaned `consumed` agenda item; lobby auto-nav no longer fights the back gesture. Audit attribution (`discardedBy`) is captured for a future UI surface with no schema change.
- Harder: every new consumer reading `revealedAt` or `skippedAt` directly is a latent bug — must route through `terminalState()`. PR review checklist: grep for direct reads; require either a `terminalState()` funnel or a one-line rationale.
- Revisit when: discard volume grows enough to warrant proactive doc-side garbage collection, or product wants a "view discarded rounds" surface (would graduate the tombstone to a first-class history entry).
