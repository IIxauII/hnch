# Yjs Doc Schema

This document describes the shape of the Yjs doc that represents a single hnch session. The doc is the single source of truth for session state — everything that needs to survive a client reconnect, be visible to all participants, or be snapshotted by the relay lives here.

**Scope.** Schema v1. Any change to this document is a schema change and requires a new ADR (see [ADR-0013](../adr/0013-round-model-flat-parentroundid.md) for an example of a schema-shape decision).

**Related ADRs.** This schema derives from decisions in:
- [ADR-0003](../adr/0003-state-sync-yjs.md) — Yjs as the CRDT library
- [ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md) — device identity (`participantId` is the device ID)
- [ADR-0006](../adr/0006-ephemeral-sessions.md) — sessions are per-meeting
- [ADR-0008](../adr/0008-room-code-format.md) — room codes resolve to `roomUuid`
- [ADR-0010](../adr/0010-host-election.md) — host election mechanics (`hostParticipantId` storage)
- [ADR-0013](../adr/0013-round-model-flat-parentroundid.md) — flat rounds with `parentRoundId` lineage
- [ADR-0018](../adr/0018-remove-timer-add-unanimous-reveal.md) — removed countdown timer; added unanimous auto-reveal; `timerStartedAt` repurposed as stopwatch origin
- [ADR-0019](../adr/0019-scale-customization.md) — scale customization: 5 builtin presets, sentinel removal, device-local overrides and custom scales
- [ADR-0036](../adr/0036-participant-removal-lifecycle.md) — participant removal lifecycle (`leftAt` / `removedBy` soft-delete fields)
- [ADR-0040](../adr/0040-skipped-rounds.md) — skip as a distinct round terminal state (`skippedAt`); `terminalState()` helper for CRDT tie-break
- [ADR-0041](../adr/0041-per-round-abstain-sentinel.md) — per-round abstain sentinel (`hnch_abstain` in `round.votes`); auto-reveal amendment
- [ADR-0042](../adr/0042-pre-session-agenda.md) — pre-session story agenda (`agenda: Y.Array<Y.Map>` + `round.agendaItemId` backref)
- [ADR-0043](../adr/0043-per-participant-avatar-color.md) — per-participant avatar color (`avatarColor?` on participant record)

**Not covered here.** Teams are local-only and never enter the Yjs doc (see [ADR-0007](../adr/0007-teams-local-only.md)). Access control tokens (password hash, invite tokens) are managed by the relay and not stored in the doc ([ADR-0009](../adr/0009-access-control-relay-tokens.md)). Room codes are a relay-side lookup to `roomUuid` and do not appear in the doc ([ADR-0008](../adr/0008-room-code-format.md), [ADR-0012](../adr/0012-snapshot-policy.md)).

## Top-level structure

```
Y.Doc
├── meta: Y.Map             // set once at creation, immutable
├── settings: Y.Map         // host-editable session config
├── participants: Y.Map     // keyed by participantId
├── rounds: Y.Array         // flat list of round records
└── agenda: Y.Array         // pre-session story queue (ADR-0042)
```

Ephemeral presence data (online status, typing indicators, cursors if we ever add them) lives in **Yjs awareness**, not in the doc. Awareness carries the `participantId` so that peers can map an awareness entry back to a participant record in the doc.

## `meta` — session header

Set at session creation. Fields are immutable after creation except `sessionEndedAt`, which is written when the host ends the session for everyone.

| Field | Type | Description |
|---|---|---|
| `roomUuid` | `string` | Internal UUID for this session. Room codes (ADR-0008) are a separate relay-side lookup to this UUID. |
| `createdAt` | `number` | Unix milliseconds when the session was created. |
| `createdBy` | `string` | `participantId` of the creator. This is also the initial host (ADR-0010). |
| `sessionEndedAt?` | `number` | Optional. Unix milliseconds when the host ended the session for everyone. Additive field — absent means the session is still active. |

## `settings` — session config

Host-editable. Changes propagate to all clients via Yjs. The "host" at any moment is whoever `hostParticipantId` currently points to; host-only UI actions are gated client-side.

| Field | Type | Description |
|---|---|---|
| `name?` | `string` | Human-readable session name, e.g. `"Sprint 42 planning"`. Optional. |
| `defaultScale` | `Scale` | Scale inherited by newly-created rounds. See "Scale type" below. |
| `hostParticipantId` | `string` | The `participantId` currently holding host authority. Updated by the election mechanism described in ADR-0010. |

### Host authority mechanics (summary)

- `hostParticipantId` is stable across network blips — reconnecting within the 5-second debounce window does not trigger a new election ([ADR-0010](../adr/0010-host-election.md)).
- Liveness check: is there an awareness entry for `hostParticipantId`? If no, and the absence persists beyond the 5-second debounce, election runs (lowest Yjs peer ID among connected participants wins) and the winner's `participantId` is written to this field.
- "No reclaim": a former host who reconnects after losing the role does not automatically regain it.

## `participants` — who's in the session

`Y.Map<participantId, Y.Map>`.

- **Key:** `participantId`. In schema v1, this equals the device ID from [ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md).
- **Value:** a `Y.Map` with the following fields:

| Field | Type | Description |
|---|---|---|
| `displayName` | `string` | The name shown to other participants. User-editable. |
| `joinedAt` | `number` | Unix milliseconds when this participant first joined the session. |
| `role?` | `'voter' \| 'viewer'` | Optional participant role ([ADR-0020](../adr/0020-participant-viewer-voter-role.md)). Defaults to `'voter'` if absent. Viewers cannot vote and are excluded from unanimous auto-reveal checks. |
| `leftAt?` | `number` | Optional. Unix milliseconds when the participant was removed from the active roster ([ADR-0036](../adr/0036-participant-removal-lifecycle.md)). Absent ⇒ active. Set on voluntary "Leave Session" or host kick. NOT set by transient disconnect — offline presence stays awareness-driven. Cleared on re-join (self upsert in `joinSession`). |
| `removedBy?` | `string` | Optional. `participantId` of the actor that wrote `leftAt`. Equal to the target ⇒ voluntary leave; otherwise ⇒ kicked by host. Used by clients to render the right toast/system message ([ADR-0036](../adr/0036-participant-removal-lifecycle.md)). |
| `avatarColor?` | `string` | Optional. User-chosen avatar color ([ADR-0043](../adr/0043-per-participant-avatar-color.md)). Wire value is an `AccentKey` palette entry (one of 12) or a `#rrggbb` hex literal. Absent ⇒ clients derive a stable hue deterministically from `participantId`. Readers must use `resolveAvatarColor()` to tolerate unknown/malformed values from old or future clients. |

A participant stays in this map even if they disconnect — the map is cumulative for the session's lifetime. Online status is derived from **awareness**, not from this map.

**Active vs. removed.** Active rosters (lobby, voter denominator, "didn't vote" set) filter on `!leftAt`. Round history (`round.votes` keyed by `participantId`) reads the raw `participants` map so removed names still resolve in past rounds ([ADR-0036](../adr/0036-participant-removal-lifecycle.md)).

## `rounds` — the flat list of round records

`Y.Array<Y.Map>`. Re-votes are modeled by creating a new round with `parentRoundId` pointing at the prior round ([ADR-0013](../adr/0013-round-model-flat-parentroundid.md)).

Each round's `Y.Map`:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID. |
| `title?` | `string` | E.g. `"Auth migration"`. Optional; inherited from parent on re-vote. |
| `description?` | `string` | Longer context; inherited from parent on re-vote. |
| `ticketId?` | `string` | Tracker reference like `"PROJ-1234"`; inherited from parent on re-vote. |
| `parentRoundId?` | `string` | If this is a re-vote, the `id` of the previous round in the chain. |
| `scale` | `Scale` | Snapshotted at round creation from `settings.defaultScale` (or chosen per-round by the host). Independent after creation — changing `settings.defaultScale` later does not alter existing rounds. |
| `timerStartedAt?` | `number` | Unix milliseconds when voting started. Always written at round creation. Used as a stopwatch origin for elapsed voting time display ([ADR-0018](../adr/0018-remove-timer-add-unanimous-reveal.md)). |
| `revealedAt?` | `number` | Unix milliseconds when the round was revealed. Written by the host (manual reveal) or by any client when all online participants have voted (unanimous auto-reveal, [ADR-0018](../adr/0018-remove-timer-add-unanimous-reveal.md)). Absent means not yet revealed. |
| `skippedAt?` | `number` | Unix milliseconds when the host skipped the round ([ADR-0040](../adr/0040-skipped-rounds.md)). Mutually exclusive terminal state with `revealedAt` at the writer; multiple terminal fields can coexist after a concurrent CRDT merge — the earliest timestamp wins via `terminalState()`. Absent means not skipped. |
| `discardedAt?` | `number` | Unix milliseconds when the host discarded the round via the Estimating back chevron ([ADR-0046](../adr/0046-round-discard-tombstone.md)). Distinct from skip: linked agenda item stays `pending`, no history entry, excluded from `currentRound()` and history projections. Mutually exclusive with `revealedAt` / `skippedAt` at the writer; multiple terminal fields can coexist after a concurrent CRDT merge — the earliest timestamp wins via `terminalState()`. Absent means not discarded. |
| `discardedBy?` | `string` | `participantId` of the host that wrote `discardedAt`. Audit field, no immediate UI consumer. Always written alongside `discardedAt`. |
| `createdBy` | `string` | `participantId` of whoever created the round. |
| `createdAt` | `number` | Unix milliseconds when the round was created. |
| `votes` | `Y.Map<participantId, string>` | Votes keyed by participant. Value is a card face (e.g. `"5"`, `"M"`, `"High"`) or the abstain sentinel `"hnch_abstain"` ([ADR-0041](../adr/0041-per-round-abstain-sentinel.md)). Vote-change-before-reveal ([ADR-0013](../adr/0013-round-model-flat-parentroundid.md)) is just overwriting this key. Only the final value is retained. Absent key = not yet voted. |
| `agendaItemId?` | `string` | Optional. ID of the agenda item this round was started from ([ADR-0042](../adr/0042-pre-session-agenda.md)). Absent when the round was not created from an agenda item. On re-vote, callers pass the parent round's `agendaItemId` unchanged — the agenda item state is not modified again. |

Note: `revealMode` and `timerDurationMs` were removed in [ADR-0018](../adr/0018-remove-timer-add-unanimous-reveal.md). Reveal is always manual + unanimous auto-reveal. `timerStartedAt` is retained as a stopwatch origin.

## Scale type

```ts
type Scale = {
  id: string        // builtin preset ID or 'custom-${uuid}'
  cards: string[]   // e.g. ["0","1","2","3","5","8","13","21"]
}
```

Scales are represented inline (not as a lookup to a shared registry) so that:
- Custom scales work without coordination between client versions.
- A scale's definition at round creation is frozen in the round record, preserving historical meaning if the session's default scale is later changed.

Card values are arbitrary strings — numbers, t-shirt sizes, risk labels, or any domain-specific values a team defines.

**Builtin presets** (defined in `packages/shared/src/doc.ts`):

| ID | Cards |
|----|-------|
| `fibonacci` | 0, 1, 2, 3, 5, 8, 13, 21 |
| `t-shirt` | XS, S, M, L, XL |
| `powers-of-2` | 1, 2, 4, 8, 16, 32, 64 |
| `linear` | 1–10 |
| `risk` | Low, Medium, High, Critical |

The `?` (unsure) and `☕` (coffee break) sentinel cards have been removed from all builtin scales (ADR-0019). They were not estimates.

**Device-local customization** (ADR-0019): users can toggle individual cards on/off per preset (`PresetOverrides`) and define fully custom scales (`CustomScale`, ID prefixed `custom-`). Customization is resolved client-side before writing to the doc — the wire format is always a flat `{ id, cards }` with all enabled cards present. `PresetOverrides` and `CustomScale` are defined in `packages/shared/src/scales.ts` and are not part of the Yjs doc schema.

## `agenda` — pre-session story queue

`Y.Array<Y.Map>`. Ordered list of stories the host queues up before or during the session ([ADR-0042](../adr/0042-pre-session-agenda.md)). Items are displayed in ascending lexicographic order of their `sortKey` field. All participants can see the full list; only the host may mutate it.

Each item's `Y.Map`:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID (`crypto.randomUUID()`). Stable for the item's lifetime. |
| `title?` | `string` | Human-readable story title. At least one of `{title, ticketId}` is required. |
| `description?` | `string` | Longer story context. Optional. |
| `ticketId?` | `string` | Issue tracker reference, e.g. `"PROJ-1234"`. At least one of `{title, ticketId}` is required. |
| `state` | `string` | Item lifecycle state. Open string enum — see "State enum" below. |
| `source` | `string` | Import source. Open string enum: `'manual'` (default) or future values `'jira'`, `'linear'`, `'github'`. Present now to avoid a schema change when importers land. |
| `externalId?` | `string` | External system identifier for future importers (e.g. Jira issue key). Paired with `source`. |
| `sortKey` | `string` | Fractional-index sort key (base-62 string). Items displayed in ascending lex order. Only `pending` items may have their `sortKey` changed; all other states are frozen. |
| `createdAt` | `number` | Unix milliseconds when the item was created. |
| `consumedAt?` | `number` | Unix milliseconds when the item was consumed (state → `consumed`). Written atomically with `consumedByRoundId`. |
| `consumedByRoundId?` | `string` | ID of the round that consumed this item. Backref to `rounds[].id`. Written atomically with `consumedAt`. |

### State enum

`state` is an open string — clients must tolerate unknown values from future versions.

| Value | Meaning |
|---|---|
| `pending` | Waiting to be estimated. Default on creation. |
| `consumed` | A round has been created for this item (`consumedByRoundId` set). |
| `skipped` | Host chose to skip the item without creating a round. Terminal. |
| `cancelled` | Soft-deleted. Excluded from active agenda views. Terminal. |

Valid transitions (at the writer — CRDT merge may produce concurrent writes):
- `pending` → `consumed` | `skipped` | `cancelled`
- `consumed` → `consumed` (idempotent)
- All other transitions rejected at the writer.

The `pending → consumed` transition is written **at the round's terminal state** (reveal or skip) — see [ADR-0045](../adr/0045-agenda-consume-at-round-terminal.md). Round-start does not consume; the linked agenda item stays `pending` so a host back-chevron discard ([ADR-0046](../adr/0046-round-discard-tombstone.md)) leaves the item re-startable.

### Fractional indexing (`sortKey`)

`sortKey` uses the `keyBetween(a, b)` utility in `packages/shared/src/fractional-index.ts`. One key rewrite per reorder; no neighbor renumbering. Yjs LWW semantics on a `Y.Map` key means concurrent reorders converge deterministically. The display sort is always lexicographic on `sortKey`.

### Re-vote inheritance

On re-vote ([ADR-0013](../adr/0013-round-model-flat-parentroundid.md)), the caller passes the parent round's `agendaItemId` to the new round unchanged. The agenda item state is **not** changed again — only one `consumed` write occurs per item.

### Extensibility

`source` and `externalId` are shipped with the base schema so that future importers (Jira, Linear, GitHub) can be added without a schema change. No importer logic exists in v1; the fields default to `source='manual'`, `externalId=undefined`.

### Lifetime

Agenda items share the doc's 24h relay snapshot TTL ([ADR-0012](../adr/0012-snapshot-policy.md)). Items are not persisted beyond the session's snapshot lifetime.

## Derived state (not stored)

These are computed on the client from the doc; they are not persisted:

- **Round status:** materialized on the projection `Round` as two derived fields, `status` and `terminalAt`, computed once in `projectRound` — readers branch on these and never see the raw terminal timestamps. `status: 'pending' | 'voting' | 'revealed' | 'skipped' | 'discarded'` is `terminalState(round) ?? (timerStartedAt ? 'voting' : 'pending')`; `terminalAt` is the winning terminal timestamp (present only when `status` is terminal) and is the sole source for elapsed-time display. `terminalState()` (internal to `packages/shared`, not on the public barrel) resolves the three raw timestamps — `revealedAt` / `skippedAt` / `discardedAt` — under the earliest-wins / reveal→skip→discard tie-break and returns `'revealed' | 'skipped' | 'discarded' | null` ([ADR-0046](../adr/0046-round-discard-tombstone.md)).
- **Current round:** the last round in `rounds` with no terminal field set; if all are terminal, the last NON-DISCARDED round (discarded rounds are tombstones — never the active or "last result" anchor).
- **Elapsed voting time:** `Date.now() - round.timerStartedAt` (counting up, displayed as a stopwatch).
- **All voted:** every online *active* voter (awareness set ∩ `!leftAt` ∩ `role !== 'viewer'`) has a key in `round.votes` — including `"hnch_abstain"` entries, which satisfy the predicate ([ADR-0041](../adr/0041-per-round-abstain-sentinel.md)). When true, any client writes `revealedAt` (unanimous auto-reveal, [ADR-0018](../adr/0018-remove-timer-add-unanimous-reveal.md); left-participant exclusion per [ADR-0036](../adr/0036-participant-removal-lifecycle.md)).
- **Lineage chain:** walk `parentRoundId` backwards from a round to collect the full re-vote history for that item (useful for UI display and exports).
- **Host liveness:** awareness has an entry for `settings.hostParticipantId`. Absence for longer than the 5-second debounce triggers election (ADR-0010).

## Awareness (ephemeral presence)

Each connected client publishes an awareness entry with at least:

| Field | Type | Description |
|---|---|---|
| `participantId` | `string` | So other clients can map this awareness entry to a participant record in the doc. |

The online set is exactly the set of awareness entries. A participant who appears in `participants` but has no awareness entry is offline.

Future awareness fields (typing indicators, cursor positions, "is currently editing the round title") will be added here, not in the doc, so they don't bloat the CRDT history.

## Versioning

This is schema v1. The schema is not explicitly version-stamped in the doc itself — we rely on the repository-level invariant that "the current schema is whatever this document describes, and any change is preceded by an ADR." If we ever need inline version-stamping (for example, to support multiple schema versions coexisting during a migration), we will add a `meta.schemaVersion` field via a superseding ADR.

**Backward-incompatible changes** (field renames, type changes, shape restructuring) require a new ADR that supersedes or amends the relevant prior ADR, and updates to this file.

**Additive changes** (new optional fields) still require an ADR noting the addition, but can be rolled out without coordination as long as older clients tolerate unknown fields.
