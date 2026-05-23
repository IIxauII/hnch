# Agenda item orphaned as `consumed` when host backs out of estimating

**Status:** Draft
**Date:** 2026-05-22
**Source:** https://github.com/IIxauII/hnch/issues/299

## Problem

When a host starts a round from an agenda item and then taps the back chevron in Estimating before reveal/skip, the agenda item is left permanently `consumed` with no way to revote it, and the back button itself "feels broken" — Lobby's auto-nav effect bounces the host straight back to Estimating because the round is still non-terminal.

Quoting the issue: *"There is no way to revote on it"* and *"back button feels like a no-op"*.

Root cause is three coupled things: agenda item is consumed atomically at round-start (not at terminal state), `consumed` is a terminal writer state with no un-consume transition, and `softExit()` in Estimating navigates without terminating the round.

## Users

- **Host** — primary actor. Starts rounds from agenda items, decides when a round is done.
- **Voter** — affected when host discards an in-flight round (gets returned to Lobby).
- **Viewer** — same as voter (observer of the same nav transition).

## Proposed behavior

**Agenda item lifecycle (revised):**
- Tapping an agenda item → Start Round modal → Submit starts a round but does NOT mark the item `consumed`. Item stays `pending`.
- When the round reaches a terminal state (revealed or skipped), the linked agenda item is marked `consumed` at that moment.
- Result: an in-flight round leaves the item in `pending`, so a discarded round naturally leaves the item available for re-estimation.

**Back chevron in Estimating (host):**
- Visible only to the host.
- Tap → silent discard of the in-flight round (round removed from doc, no terminal state written, no history entry, no confirm dialog).
- Host lands on Lobby. Agenda item is still in `pending` (it was never consumed).

**Back chevron in Estimating (non-host voter / viewer):**
- No back affordance during an active round. They wait for terminal state.

**Voter experience when host discards:**
- Voter is auto-nav'd to Lobby silently (doc no longer has `currentRound`, Lobby's existing effect handles the transition).
- No toast, no banner. Votes cast pre-discard are lost with the round.

**Lobby during an in-flight round:**
- Not visible to anyone — all clients are in Estimating during flight. No in-flight indicator needed.

## Success criteria

- Host can tap back in Estimating and reach Lobby; back chevron is no longer a no-op.
- After host backs out, the originating agenda item is selectable again and a new round can be started from it.
- Voters/viewers never see the back chevron during an active round.
- A revealed or skipped round still marks its linked agenda item `consumed` (terminal lifecycle preserved).
- No agenda item can be left in `consumed` state pointing to a round that has neither `revealedAt` nor `skippedAt`.

## Scope

**In:**
- Defer agenda item `consume` write from round-start to round-terminal (reveal and skip paths).
- Host-only back affordance in Estimating that discards the in-flight round.
- Voter/viewer back affordance hidden during active round.
- Superseding ADR documenting the agenda lifecycle change.

**Out (explicit anti-goals):**
- No confirm dialog for host discard.
- No toast/banner for voters when round is discarded.
- No "round in progress" indicator on agenda items in Lobby (Lobby is unreachable during flight).
- No `consumed → pending` transition (approach B from the issue); the item is never consumed during flight in the first place.
- No back-button-as-implicit-skip (approach C); discard ≠ skip.
- No round-history entry for discarded rounds.
- No re-vote lineage from a discarded round (`parentRoundId` unaffected; discard is a delete, not a fork).

## Open questions

- Multi-host edge case: if host role transfers mid-flight (current host drops, new host elected), does the new host get the back/discard affordance immediately? Assumed yes; `/plan` to verify against ADR-0010 election semantics.
- Race: host discards at the same instant a voter casts. CRDT will merge a vote into a now-deleted round — does the round resurrect, or does the delete win? `/plan` to specify the delete-wins semantics and any tombstone needed to prevent resurrection.
- Does "discard" delete the entire round node from the Yjs map, or write a `discardedAt` tombstone field? Affects round-history reads and the resurrection race above.

## ADR impact

- **ADR-0042 (pre-session agenda)** — will be superseded. Lifecycle changes from *consume-at-start* to *consume-at-terminal*; superseding ADR documents the new state machine and the discard semantics.
- **ADR-0040 (skip semantics)** — unchanged. Discard is distinct from skip (no terminal write, no history entry).
- **ADR-0013 (rounds list)** — may need a clarifying note that rounds can be deleted pre-terminal; not a supersede.

## References

- Issue: https://github.com/IIxauII/hnch/issues/299
- ADR-0042 (pre-session agenda): `adr/0042-pre-session-agenda.md`
- ADR-0040 (skip semantics): `adr/0040-skipped-rounds.md`
- ADR-0013 (rounds list): `adr/0013-rounds-list.md`
- Code refs from issue: `packages/client/src/app/lobby/lobby.page.ts:1016-1028`, `packages/shared/src/doc-projection.ts:809`, `packages/client/src/app/estimating/estimating.page.ts:658-662`, `packages/client/src/app/lobby/lobby.page.ts:975-982`

## Screenshot scope (suggested)

Informational for `/plan`. Likely tags: `lobby-agenda`, `estimating-header`. Visual baseline of current Estimating header back chevron + Lobby agenda list helps verify the host-only back affordance and the post-discard item state.
