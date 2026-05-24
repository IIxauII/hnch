# ADR-0042: Pre-session story agenda

**Status:** Superseded by [ADR-0045](0045-agenda-consume-at-round-terminal.md)
**Date:** 2026-05-17

## Context

- Hosts re-type each story title and ticket ID into the round-start modal mid-meeting, even when the backlog was prepared beforehand. Causes typos and slows sessions.
- An ordered agenda stored in the Yjs doc lets hosts queue items in advance; "Next Round" auto-pre-fills from the next pending item.
- All participants see "what's next", reducing ad-hoc chatter.
- Schema must accommodate future importers (Jira, Linear, GitHub) without a breaking change.
- Relay is content-blind ([ADR-0001](0001-networking-crdt-over-relay.md)); all state travels via Yjs doc.
- Doc has a 24h TTL on the relay ([ADR-0012](0012-snapshot-policy.md)); agenda shares this lifetime.
- Re-vote model is flat Y.Array + `parentRoundId` ([ADR-0013](0013-round-model-flat-parentroundid.md)); backref from round to agenda item must not break that lineage.
- Host election ([ADR-0010](0010-host-election.md)) means host-only agenda mutations must tolerate a brief dual-writer window; fractional `sortKey` strings are LWW-safe.

## Decision

Add `agenda: Y.Array<Y.Map>` as a new top-level Yjs array on the doc. Each item carries:

```
id: string              // crypto.randomUUID()
title?: string          // ≥1 of {title, ticketId} required (client/CLI validator)
description?: string
ticketId?: string
state: string           // open enum: 'pending' | 'consumed' | 'skipped' | 'cancelled'
source: string          // open enum: default 'manual'; future: 'jira' | 'linear' | 'github'
externalId?: string
sortKey: string         // fractional-index base-62 string; monotone lex order
createdAt: number
consumedAt?: number
consumedByRoundId?: string
```

Add `agendaItemId?: string` backref to the `Round` record ([ADR-0013](0013-round-model-flat-parentroundid.md)). On re-vote, caller passes parent's `agendaItemId` unchanged; agenda item state is not modified again.

State transitions (valid at writer; CRDT merge may produce impossible combinations — readers treat earliest-written terminal state as authoritative for display):
- `pending` → `consumed` | `skipped` | `cancelled`
- `consumed` → `consumed` (idempotent)
- All other transitions rejected at writer.

Reorder is fractional-indexing via a `keyBetween(a, b)` utility in `@hnch/shared` (new `fractional-index.ts`). One key rewrite per drag-drop; no neighbor renumbering. Pending items only — consumed/skipped/cancelled `sortKey` is frozen.

## Trade-offs

- Agenda dies with the 24h doc TTL ([ADR-0012](0012-snapshot-policy.md)) — no durable storage without a separate persistence layer.
- `state` is an open string enum, not a TS discriminated union, so unknown states from future clients pass through without type error; consumers must guard explicitly.
- Fractional keys can become arbitrarily long under repeated mid-inserts between the same two neighbors; practically bounded by UX (users stop reordering after a point).
- Dual-writer window during host handoff ([ADR-0010](0010-host-election.md)) can produce two agenda items with `sortKey` ordering that diverges between the two docs until sync; Yjs merge resolves both items present, display order determined by lex key comparison.
- `agendaItemId` backref on `Round` is voluntary — no relay enforcement. Stale backref after agenda cleared (e.g. cancelled) resolves to undefined in projection; consumers display round title or fallback gracefully.
- No cascade on cancel/skip — rounds linked to a cancelled item retain their `agendaItemId`; semantics are "was linked to this item" not "item is still active".

## Consequences

- Easier: Hosts prep agenda before the meeting; "Next Round" pre-fills from next pending item; participants see queue; future importers (Jira/Linear/GitHub) add `source`+`externalId` without schema change; round history can fall back to agenda item title when `round.title` absent.
- Harder: Every `projectDoc` consumer gets a new `agenda` field; clients that display round history must handle `agendaItemId` resolution and graceful missing-item fallback; test coverage must span all four state transitions + CRDT concurrent-append.
- Revisit when: Agenda needs to survive session TTL (→ relay-side persistence, supersedes ADR-0012); multiple items consumed per round (→ array backref); drag-and-drop reorder (no schema change, client-only); importer integrations (no schema change, `source`+`externalId` already present).
