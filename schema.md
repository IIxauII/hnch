# Yjs Doc Schema

This document describes the shape of the Yjs doc that represents a single hnch session. The doc is the single source of truth for session state — everything that needs to survive a client reconnect, be visible to all participants, or be snapshotted by the relay lives here.

**Scope.** Schema v1. Any change to this document is a schema change and requires a new ADR (see [ADR-0013](adr/0013-round-model-flat-parentroundid.md) for an example of a schema-shape decision).

**Related ADRs.** This schema derives from decisions in:
- [ADR-0003](adr/0003-state-sync-yjs.md) — Yjs as the CRDT library
- [ADR-0005](adr/0005-device-identity-capacitor-device-plugin.md) — device identity (`participantId` is the device ID)
- [ADR-0006](adr/0006-ephemeral-sessions.md) — sessions are per-meeting
- [ADR-0008](adr/0008-room-code-format.md) — room codes resolve to `roomUuid`
- [ADR-0010](adr/0010-host-election.md) — host election mechanics (`hostParticipantId` storage)
- [ADR-0011](adr/0011-timer-authority.md) — timer fields (`timerStartedAt`, `timerDurationMs`)
- [ADR-0013](adr/0013-round-model-flat-parentroundid.md) — flat rounds with `parentRoundId` lineage

**Not covered here.** Teams are local-only and never enter the Yjs doc (see [ADR-0007](adr/0007-teams-local-only.md)). Access control tokens (password hash, invite tokens) are managed by the relay and not stored in the doc ([ADR-0009](adr/0009-access-control-relay-tokens.md)). Room codes are a relay-side lookup to `roomUuid` and do not appear in the doc ([ADR-0008](adr/0008-room-code-format.md), [ADR-0012](adr/0012-snapshot-policy.md)).

## Top-level structure

```
Y.Doc
├── meta: Y.Map             // set once at creation, immutable
├── settings: Y.Map         // host-editable session config
├── participants: Y.Map     // keyed by participantId
└── rounds: Y.Array         // flat list of round records
```

Ephemeral presence data (online status, typing indicators, cursors if we ever add them) lives in **Yjs awareness**, not in the doc. Awareness carries the `participantId` so that peers can map an awareness entry back to a participant record in the doc.

## `meta` — session header

Set once at session creation. Never modified afterwards.

| Field | Type | Description |
|---|---|---|
| `roomUuid` | `string` | Internal UUID for this session. Room codes (ADR-0008) are a separate relay-side lookup to this UUID. |
| `createdAt` | `number` | Unix milliseconds when the session was created. |
| `createdBy` | `string` | `participantId` of the creator. This is also the initial host (ADR-0010). |

## `settings` — session config

Host-editable. Changes propagate to all clients via Yjs. The "host" at any moment is whoever `hostParticipantId` currently points to; host-only UI actions are gated client-side.

| Field | Type | Description |
|---|---|---|
| `name?` | `string` | Human-readable session name, e.g. `"Sprint 42 planning"`. Optional. |
| `defaultScale` | `Scale` | Scale inherited by newly-created rounds. See "Scale type" below. |
| `defaultRevealMode` | `'manual' \| 'timer' \| 'unanimous'` | Default reveal mode inherited by newly-created rounds. |
| `defaultTimerDurationMs?` | `number` | Default timer duration inherited by newly-created rounds. Absent or `0` means no timer. |
| `hostParticipantId` | `string` | The `participantId` currently holding host authority. Updated by the election mechanism described in ADR-0010. |

### Host authority mechanics (summary)

- `hostParticipantId` is stable across network blips — reconnecting within the 5-second debounce window does not trigger a new election ([ADR-0010](adr/0010-host-election.md)).
- Liveness check: is there an awareness entry for `hostParticipantId`? If no, and the absence persists beyond the 5-second debounce, election runs (lowest Yjs peer ID among connected participants wins) and the winner's `participantId` is written to this field.
- "No reclaim": a former host who reconnects after losing the role does not automatically regain it.

## `participants` — who's in the session

`Y.Map<participantId, Y.Map>`.

- **Key:** `participantId`. In schema v1, this equals the device ID from [ADR-0005](adr/0005-device-identity-capacitor-device-plugin.md).
- **Value:** a `Y.Map` with the following fields:

| Field | Type | Description |
|---|---|---|
| `displayName` | `string` | The name shown to other participants. User-editable. |
| `joinedAt` | `number` | Unix milliseconds when this participant first joined the session. |

A participant stays in this map even if they disconnect — the map is cumulative for the session's lifetime. Online status is derived from **awareness**, not from this map.

## `rounds` — the flat list of round records

`Y.Array<Y.Map>`. Re-votes are modeled by creating a new round with `parentRoundId` pointing at the prior round ([ADR-0013](adr/0013-round-model-flat-parentroundid.md)).

Each round's `Y.Map`:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID. |
| `title?` | `string` | E.g. `"Auth migration"`. Optional; inherited from parent on re-vote. |
| `description?` | `string` | Longer context; inherited from parent on re-vote. |
| `ticketId?` | `string` | Tracker reference like `"PROJ-1234"`; inherited from parent on re-vote. |
| `parentRoundId?` | `string` | If this is a re-vote, the `id` of the previous round in the chain. |
| `scale` | `Scale` | Snapshotted at round creation from `settings.defaultScale` (or chosen per-round by the host). Independent after creation — changing `settings.defaultScale` later does not alter existing rounds. |
| `revealMode` | `'manual' \| 'timer' \| 'unanimous'` | How the round reveals. `manual` = host triggers; `timer` = auto on expiry; `unanimous` = auto when every connected participant has voted. |
| `timerDurationMs?` | `number` | Timer duration for this round. Absent or `0` means no timer. |
| `timerStartedAt?` | `number` | Unix milliseconds when the timer started. Written by the host ([ADR-0011](adr/0011-timer-authority.md)). Absent means voting has not started. |
| `revealedAt?` | `number` | Unix milliseconds when the round was revealed. Written by the host, or by any client as a fallback if the timer expires with no host present ([ADR-0011](adr/0011-timer-authority.md)). Absent means the round has not been revealed. |
| `createdBy` | `string` | `participantId` of whoever created the round. |
| `createdAt` | `number` | Unix milliseconds when the round was created. |
| `votes` | `Y.Map<participantId, string>` | Votes keyed by participant. The value is the card face (e.g. `"5"`, `"?"`, `"☕"`). Vote-change-before-reveal ([ADR-0013](adr/0013-round-model-flat-parentroundid.md)) is just overwriting this key. Only the final value is retained. |

## Scale type

```ts
type Scale = {
  id: string        // 'fibonacci' | 't-shirt' | `custom-${uuid}`
  cards: string[]   // e.g. ["0","1","2","3","5","8","13","21","?","☕"]
}
```

Scales are represented inline (not as a lookup to a shared registry) so that:
- Custom scales work without coordination between client versions.
- A scale's definition at round creation is frozen in the round record, preserving historical meaning if the session's default scale is later changed.

Card values are arbitrary strings — numbers, t-shirt sizes, emoji, and sentinels like `"?"` (unsure) and `"☕"` (coffee break) are all just string values.

## Derived state (not stored)

These are computed on the client from the doc; they are not persisted:

- **Round status:** `revealedAt ? 'revealed' : (timerStartedAt ? 'voting' : 'pending')`.
- **Current round:** the last round in `rounds` whose `revealedAt` is unset; if all are revealed, the last round overall.
- **"Everyone voted":** `votes.size === countOnlineParticipants()`, where online participants come from awareness. Used to trigger `'unanimous'` reveal client-side.
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
