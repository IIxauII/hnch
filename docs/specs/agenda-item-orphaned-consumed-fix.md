# Agenda item orphaned as `consumed` when host backs out of estimating

**Status:** Draft
**Date:** 2026-05-23
**Source:** https://github.com/IIxauII/hnch/issues/299

## Problem

When a host starts a round from an agenda item and then taps the back chevron in Estimating before reveal or skip, the agenda item is left permanently `consumed` with no path back to `pending`, and the back button itself "feels broken" — Lobby's auto-nav effect bounces the host straight back to Estimating because the in-flight round is still non-terminal.

Quoting the issue: *"There is no way to revote on it"* and *"back button feels like a no-op"*.

Three coupled causes: agenda items are consumed atomically at round-start (not at terminal state), the `consumed` writer state has no reverse transition, and `softExit()` in Estimating navigates without terminating the round.

## Users

- **Host** — primary actor. Starts rounds from agenda items, decides when a round is done or should be thrown away.
- **Voter** — affected when host discards an in-flight round (gets auto-nav'd back to Lobby; any cast vote is lost).
- **Viewer** — same as voter (passive observer of the same nav transition).

## Proposed behavior

**Agenda item lifecycle (revised):**
- Tapping an agenda item → Start Round modal → Submit starts a round but does NOT mark the item `consumed`. The item stays `pending` for the duration of the round.
- When the round reaches a terminal state (revealed or skipped), the linked agenda item is marked `consumed` at that moment.
- A discarded round (see below) leaves the agenda item in `pending`, so the host can immediately start a fresh round from the same item.

**Back chevron in Estimating — host:**
- Visible only to the host.
- Tap → silent discard of the in-flight round. No confirmation dialog.
- Host lands on Lobby. Originating agenda item is still in `pending`.

**Back chevron in Estimating — voter / viewer:**
- No back affordance during an active round. They wait for terminal state or for the host to discard.

**Voter experience when host discards:**
- Voter is auto-nav'd to Lobby silently — once the doc reflects the discard, Lobby's existing "no active round" effect handles the transition.
- No toast, no banner. Votes cast pre-discard are lost with the round.

**Lobby during an in-flight round:**
- Not visible to anyone — all clients are in Estimating during flight. No in-flight indicator on agenda items is needed.

## Success criteria

- Host can tap back in Estimating and reach Lobby; the back chevron is no longer a no-op.
- After host backs out, the originating agenda item is selectable again and a new round can be started from it.
- Voters and viewers never see the back chevron during an active round.
- A revealed or skipped round still marks its linked agenda item `consumed` (terminal lifecycle preserved).
- No agenda item can be left in `consumed` state pointing to a round that has neither `revealedAt` nor `skippedAt`.
- A late vote merged in after the host discards does not resurrect the round on any client.

## Scope

**In:**
- Defer agenda item `consume` write from round-start to round-terminal (reveal and skip paths).
- Host-only back affordance in Estimating that discards the in-flight round.
- Voter and viewer back affordance hidden during active round.
- Discard writes a `discardedAt` tombstone on the round (round node is NOT deleted from the Yjs map). Projection treats `discardedAt` as authoritative: the round is excluded from active state, history, and any UI surface.
- Delete-wins race semantics: late votes merged into a discarded round are ignored by the projection — the round does not resurrect.
- Superseding ADR documenting the agenda item lifecycle change and the new round terminal-vs-tombstone distinction.

**Out (explicit anti-goals):**
- No confirm dialog for host discard.
- No toast or banner for voters when round is discarded.
- No "round in progress" indicator on agenda items in Lobby (Lobby is unreachable during flight).
- No `consumed → pending` transition (option B from the issue); the item is never consumed during flight in the first place.
- No back-button-as-implicit-skip (option C); discard is distinct from skip — no terminal state written, no history entry.
- No round-history entry for discarded rounds.
- No re-vote lineage from a discarded round (`parentRoundId` unaffected; discard is a tombstone, not a fork).
- No undo affordance on Lobby after discard.
- No telemetry of discard events (ADR-0028).

## Open questions

- Multi-host edge case: if host role transfers mid-flight (current host drops, new host elected per ADR-0010), does the new host get the back/discard affordance immediately? Assumed yes; `/plan` to verify against election semantics.
- Should `discardedAt` carry a `discardedBy` peer-ID (parallel to `removedBy` on participants), or is the timestamp alone sufficient? `/plan` to decide.
- Storage cost of keeping tombstoned rounds in the doc — bounded in practice (manual host action, low frequency) but `/plan` should confirm no projection hot path scales with the tombstone count.

## ADR impact

- **ADR-0042 (pre-session agenda)** — superseded. Lifecycle changes from *consume-at-start* to *consume-at-terminal*; the superseding ADR documents the new state machine and the discard semantics.
- **ADR-0013 (rounds list)** — likely superseded or amended. Introduces `discardedAt` as a third terminal-ish field alongside `revealedAt` and `skippedAt`, with delete-wins projection semantics. `/plan` to confirm whether a superseding ADR or a clarifying note suffices.
- **ADR-0040 (skip semantics)** — unchanged. Discard is distinct from skip (no terminal write, no history entry).

## References

- Issue: https://github.com/IIxauII/hnch/issues/299
- ADR-0042 (pre-session agenda): `adr/0042-pre-session-agenda.md`
- ADR-0040 (skip semantics): `adr/0040-skipped-rounds.md`
- ADR-0013 (rounds list): `adr/0013-rounds-list.md`
- Code refs from issue: `packages/client/src/app/lobby/lobby.page.ts:1016-1028`, `packages/shared/src/doc-projection.ts:809`, `packages/client/src/app/estimating/estimating.page.ts:658-662`, `packages/client/src/app/lobby/lobby.page.ts:975-982`

## Screenshot scope (suggested)

Informational for `/plan`. Likely tags: `lobby-agenda`, `estimating-header`. Visual baseline of the current Estimating header back chevron + Lobby agenda list helps verify the host-only back affordance and the post-discard `pending` item state.
