# ADR-0040: Skipped rounds — host terminal-state action distinct from reveal

**Status:** Accepted
**Date:** 2026-05-11

## Context

- Mid-session a team sometimes decides a story doesn't need estimation (done, split, deferred). Today host options are (a) reveal with sparse/no votes or (b) start new round — both pollute history with phantom or empty reveals.
- Round model is flat Y.Array of Y.Map ([ADR-0013](0013-round-model-flat-parentroundid.md)). Single terminal-state field today: `revealedAt`. Auto-reveal fires when all online voters voted ([ADR-0018](0018-remove-timer-add-unanimous-reveal.md)), denominator filtered through viewer role ([ADR-0020](0020-participant-viewer-voter-role.md)) and active participant ([ADR-0036](0036-participant-removal-lifecycle.md)).
- Relay content-blind ([ADR-0001](0001-networking-crdt-over-relay.md)); skip must travel via Yjs doc + client observation. Yjs `Y.Map.set` is per-key LWW — different keys can both survive a concurrent merge, so two terminal-state fields can both land on the same round.

## Decision

1. Add optional `skippedAt: number` (epoch ms) to Round record, sibling of `revealedAt`. Mirrors revealedAt pattern.
2. Host-only mutation `skipRound(doc, roundId, skippedAt)` in `@hnch/shared`. Writer-side guard throws if round missing, if `revealedAt` already set, or if `skippedAt` already set.
3. Terminal-state tie rule (both fields set after CRDT merge): **earlier timestamp wins** in every UI view. Single helper in shared resolves `terminalState(round): 'revealed' | 'skipped' | null`.
4. Auto-reveal predicate (`shouldAutoReveal`) gains `!skippedAt` guard. Skip mid-vote short-circuits unanimous check.
5. Votes already cast on a skipped round remain in the Yjs doc for retro auditability. All views suppress vote distribution / stats / elapsed time when terminal state is `skipped`.
6. No re-vote lineage from skip. Re-vote button hidden when latest round is skipped; only "Next Round" remains. New round started after a skip carries no `parentRoundId` to the skipped round.
7. Skip is round-level, not item-level. Does not require nested-items model from [ADR-0013](0013-round-model-flat-parentroundid.md) revisit trigger.

## Trade-offs

- Two terminal-state keys → CRDT merge can produce a round with both. Earlier-timestamp rule deterministic but non-obvious; every consumer must funnel through `terminalState()` helper or risk divergent render.
- Dead votes (cast then skipped) live in doc forever, suppressed only in UI. Wire bytes wasted; audit trail preserved.
- Writer guard catches local bugs but cannot prevent concurrent writes from separate clients (CRDT). Defense in depth, not a hard invariant.
- Hard-delete of skipped rounds rejected — loses retro signal ("we deliberately skipped this") and would require deleting round from Y.Array, breaking re-vote lineage references from any future round.
- Single combined `terminalState: 'revealed' | 'skipped'` field rejected — would supersede [ADR-0013](0013-round-model-flat-parentroundid.md) revealedAt shape and break existing readers; sibling-field additive change is cheaper.

## Consequences

- Easier: Host has explicit "this story didn't need estimation" action; history distinguishes deliberate skips from low-participation reveals; auto-reveal can't override host intent mid-skip.
- Harder: Every consumer of `revealedAt` (round history, lobby footer conditions, results section, CLI compactRoundSummary, auto-reveal predicate, navigation effect) must also consider `skippedAt`. Filtering discipline mirrors [ADR-0036](0036-participant-removal-lifecycle.md) `isActiveParticipant` pattern.
- Revisit when: Demand for undo-skip, per-round skip reason / annotation, viewer-initiated skip, or item-level skip (ADR-0013 nested items) → supersede with richer terminal-state model. Concurrent reveal+skip becomes a real user complaint → reconsider tie rule (reveal-wins or skip-wins instead of earlier-timestamp).
