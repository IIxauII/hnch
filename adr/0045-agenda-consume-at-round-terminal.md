# ADR-0045: Agenda item consume-at-round-terminal lifecycle

**Status:** Accepted
**Date:** 2026-05-23

Supersedes [ADR-0042](0042-pre-session-agenda.md).

## Context

- ADR-0042 wrote `state: 'consumed'` on the linked agenda item at round-START — the host taps Start Round and the item flips out of the pending band immediately.
- Hosts back out of Estimating before reveal/skip with the back chevron — typos in the descriptor, wrong scale, "wrong story", network jitter, etc. After ADR-0042 the item was already `consumed`, leaving an orphaned tombstone and forcing the host to re-create the item by hand. See issue #299.
- The Estimating back chevron itself was a no-op for the host: Lobby's auto-nav effect re-routes to Estimating whenever `currentRound()` is non-terminal, so leaving an in-flight round on the lobby was impossible.
- ADR-0042's "consume at start" inverts the natural lifecycle: the item is `pending` until the round actually produces an outcome (reveal or skip), not the moment the host begins voting.

## Decision

Defer the `pending → consumed` transition to the round's terminal state. `revealRound` and `skipRound` look up `round.agendaItemId` and, when set and the item is still `pending`, write `state: 'consumed'`, `consumedAt`, and `consumedByRoundId` inside the same `Y.transact`. Re-vote rounds inherit `agendaItemId` from the parent; reveal/skip on a re-vote whose linked item is already `consumed` is an idempotent no-op (no re-write of `consumedAt`).

Host back-chevron writes a new terminal field `discardedAt` (see [ADR-0046](0046-round-discard-tombstone.md)) — distinct from skip. The linked agenda item stays `pending` and is re-startable from the lobby with no manual recovery. No history entry is written for a discard.

## Trade-offs

- Item-level UI showing "currently in progress" must derive from the round projection (active round whose `agendaItemId` matches) rather than reading agenda `state`. One extra projection lookup; no schema cost.
- A round revealed twice (CRDT merge of two reveal writes) still consumes once — the writer's `state === 'pending'` guard handles idempotency; setAgendaItemState is unchanged.
- Re-vote chains where the parent already consumed must not re-write `consumedAt` on reveal of the descendant. Enforced inline in the shared writers via the `pending`-state check.

## Consequences

- Easier: orphaned `consumed` items can no longer happen — a back-chevron exit puts the item right back in the pending band. CLI and client share a single consume chokepoint inside the shared writers, so a new consumer cannot silently forget to consume.
- Harder: consume side-effects now ride inside `revealRound`/`skipRound` rather than being explicit at the caller. New consumers must read the writer doc-comment; the writer suite covers re-vote idempotency and atomic transaction semantics.
- Revisit when: agenda items grow non-trivial state machines (e.g. partial consume, multi-round outcomes) that no longer map cleanly to a single terminal transition.
