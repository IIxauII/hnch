# Agenda item orphaned `consumed` — discard-on-back fix

**Status:** Draft
**Date:** 2026-05-22
**Source spec:** [docs/specs/agenda-item-orphaned-consumed-fix.md](../specs/agenda-item-orphaned-consumed-fix.md)
**Source issue:** https://github.com/IIxauII/hnch/issues/299
**Shape:** Single PR

## Summary

Defer agenda-item `consumed` write from round-start to round-terminal (reveal/skip). Add a host-only back chevron in Estimating that hard-deletes the in-flight round from the Yjs `rounds` array. Voter recovery effect navs any peer whose mounted round vanished to Lobby. Host backing out lands on Lobby with the originating agenda item still `pending` and re-startable.

Visual anchors:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby-agenda.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating-header.png?raw=true

## Approach

**Hard-delete the round on discard.** New `discardRound(doc, id)` shared mutation removes the round Y.Map from the `rounds` Y.Array. Chosen over tombstone because:
- Discarded round has no identity worth preserving (spec rejects history entry / audit).
- No schema change → no consumer audit of `terminalState()` / `projection.rounds`.
- Concurrent vote race handled by Yjs: late `votes.set` lands on detached Y.Map → GC'd. No `castVote` guard needed.
- Trade-off: breaks "no Y.Array delete" pattern (ADR-0036 soft-delete is the participant precedent), but rounds aren't identity-bearing entities.

**Voter recovery effect in Estimating.** Single new `effect()` in `estimating.page.ts`: capture the round id at OnInit; watch `docService.rounds()`; if id absent and `currentRound() === null` → `router.navigate(['/lobby', code])`. Covers both voter (host discarded) and any peer whose round vanished without a terminal state. ~10 lines.

**Consume-at-terminal inline.** Extend `revealRound` and `skipRound` in `packages/shared/src/doc-projection.ts`: if `round.get('agendaItemId')` is set and linked item is still `pending`, call `setAgendaItemState(..., 'consumed', { consumedByRoundId, timestamp })` inside the same `doc.transact`. Existing idempotency guard at `doc-projection.ts:804` short-circuits re-vote rounds whose parent already consumed the item. `consumeAgendaItem` call sites in `lobby.page.ts onRoundStart` and `cli/session.ts newRound` removed.

**Host-only back chevron.** Estimating header back button wrapped in `@if (isHost())`. Handler renamed `softExit` → `onBackDiscard`: calls `docService.discardRound(roundId)`, then `router.navigate(['/lobby', code])`. Voters/viewers see no back affordance; the voter recovery effect handles their exit. `isHost()` is a reactive `computed()`, so a new host after mid-flight election (ADR-0010, 5s debounce) sees the chevron without re-mount. The 5s no-host window is accepted silently — matches existing reveal/skip behavior.

## ADR impact

- **ADR-0042 (pre-session agenda)** — in-place edit, silent, revising lifecycle from *consume-at-start* to *consume-at-terminal*. User-approved override of CLAUDE.md ADR immutability convention. No new superseding ADR.
- **ADR-0013 (rounds list)** — in-place clarification sentence: rounds may be hard-deleted pre-terminal via `discardRound`; post-terminal deletion forbidden.
- **ADR-0036 (participant soft-delete)** — referenced as the precedent we are deliberately not following for rounds. No edit.
- **ADR-0040 (skip semantics)** — no touch. Discard ≠ skip.
- **ADR-0010 (host election)** — no touch.

## Decisions resolved

1. **Discard mechanism** → hard-delete via `Y.Array` removal. Round has no identity worth preserving; smallest surface; no consumer audit.
2. **Resurrection race** → Yjs detached-map semantics handle it. No `castVote` guard.
3. **Consume-at-terminal write site** → inline in `revealRound` / `skipRound`, same `doc.transact`. Two callers (host UI + CLI) both want the side-effect; composer indirection is YAGNI.
4. **Back chevron gating** → `@if (isHost())` removes from DOM for non-hosts.
5. **Mid-flight host election** → reactive `isHost()` signal; new host sees chevron without re-mount. 5s no-host window silent.
6. **Pre-discard `lastVotedAt`** → leave stale. Round vanishes from projection; no stale surface.
7. **Voter recovery** → explicit Estimating-side effect (~10 lines). Reactive on `rounds()` projection.
8. **ADR-0042 update style** → in-place edit, silent.
9. **ADR-0013 update style** → in-place clarification.
10. **PR shape** → single PR.

## Phases

### Phase 1 — Hard-delete discard + consume-at-terminal

**Scope (~7 files):**

- `packages/shared/src/doc-projection.ts`
  - Add `discardRound(doc, roundId)` — finds round by id in `rounds` array, removes via `arr.delete(index, 1)`. Idempotent (no-op if not found, no-op if terminal).
  - Extend `revealRound`: after writing `revealedAt`, if `agendaItemId` present and item state `pending`, call `setAgendaItemState(..., 'consumed', { consumedByRoundId: roundId, timestamp })` in same transact.
  - Extend `skipRound`: same as reveal.
- `packages/shared/src/doc-projection.test.ts`
  - `discardRound` removes round; `currentRound()` returns null after.
  - `discardRound` on non-existent round is no-op.
  - `discardRound` on already-terminal round is no-op (or throws — pick one; recommend silent no-op for idempotency).
  - `revealRound` with linked pending item → item `consumed` in same transaction.
  - `skipRound` with linked pending item → item `consumed`.
  - `revealRound` with linked already-consumed item (re-vote) → idempotent, no throw.
  - `revealRound` with no `agendaItemId` → agenda untouched.
  - Concurrent: peer A `discardRound(r)`, peer B `castVote(r, ...)` merge → projection has no round; no vote surfaces.
- `packages/shared/src/index.ts` — export `discardRound`.
- `packages/client/src/app/lobby/lobby.page.ts` — remove `consumeAgendaItem` call in `onRoundStart` (~lines 1025-1028).
- `packages/client/src/app/estimating/estimating.page.ts`
  - Wrap back `<ion-button>` in `@if (isHost())` (~lines 106-115).
  - Rename `softExit` → `onBackDiscard`: call `docService.discardRound(roundId)`, then nav `['/lobby', code]`.
  - Add voter recovery `effect()`: capture mounted round id at OnInit; if `rounds().find(r => r.id === entryId)` is undefined and `currentRound() === null` → nav `['/lobby', code]`.
- `packages/client/src/app/services/doc.service.ts` — thin `discardRound` passthrough.
- `packages/cli/src/session.ts` — remove `consumeAgendaItem` call in `newRound` (~line 335). Reveal/skip writers in shared cover the terminal write for CLI for free.
- `adr/0042-pre-session-agenda.md` — in-place revise lifecycle section: consume at terminal, discard via hard-delete.
- `adr/0013-round-model-flat-parentroundid.md` — in-place add one sentence: rounds may be hard-deleted pre-terminal via `discardRound` (ref ADR-0042 revised); post-terminal deletion forbidden.
- `docs/schema.md` — agenda lifecycle note + discard mechanism.
- `CLAUDE.md` — revise ADR-0042 bullet under "Current decisions at a glance".
- `packages/e2e/tests/agenda-discard.spec.ts` — new e2e.

**Exit bar:**
- AC-1..AC-9 + AC-10 (re-vote) green.
- `pnpm -r typecheck && pnpm -r lint && pnpm -r test` clean.
- E2e chromium green incl. new `agenda-discard.spec.ts`.

**PR title scope:** `fix(client,shared,cli,e2e): discard in-flight round on host back; consume agenda item at terminal state`
(Verify `pr-title-lint` allowlist tolerates `adr/` + `docs/` edits without scope — likely fine since they don't release; if not, add `docs`.)

**Worktree:** `pnpm worktree:add agenda-item-orphaned-consumed-fix main` at execution time. Run `git fetch origin` first.

**Depends on:** none.

## Acceptance criteria

- [ ] AC-1: `onRoundStart` does not call `consumeAgendaItem`; agenda item remains `pending` after round start.
- [ ] AC-2: `revealRound` with linked `agendaItemId` writes `consumed` in same transaction.
- [ ] AC-3: `skipRound` with linked `agendaItemId` writes `consumed` in same transaction.
- [ ] AC-4: `discardRound` removes round from `rounds`; `currentRound()` returns null after.
- [ ] AC-5: Estimating back chevron rendered iff `isHost()`.
- [ ] AC-6: Host back tap → round removed → linked agenda item still `pending` → re-startable.
- [ ] AC-7: Voter on Estimating during host discard auto-navs to Lobby within 500ms (voter recovery effect).
- [ ] AC-8: Round-history projection unaffected — discarded round absent; revealed/skipped rounds still listed.
- [ ] AC-9: CLI parity — `newRound` no longer consumes; reveal / skip writers consume terminal.
- [ ] AC-10: Discarding a re-vote round (`parentRoundId` set) leaves parent revealed and agenda item consumed; any descendant's `parentRoundId` reference becomes dangling but lineage walk skips missing parents.

## Open questions

- Re-vote chain depth-3 lineage with discarded mid-link: confirm `lineage.ts` handles missing parent gracefully (walks up further or stops). Verify in unit test during execution; if breaks, fix in same PR.
- `pr-title-lint` allowlist behavior for `adr/` + `docs/` only paths. Trivial to verify pre-push.

## Verification plan

- **Shared:** `pnpm --filter @hnch/shared test` — cases listed in Phase 1 scope.
- **Client:** `pnpm --filter @hnch/client test && lint && typecheck`. Verify back button renders only when `isHost()` true (component test). Verify voter recovery effect (component test or e2e).
- **CLI:** `pnpm --filter @xauyxau/hnch test`.
- **E2e:** `packages/e2e/tests/agenda-discard.spec.ts`:
  - Host: start round from agenda item → back → Lobby → item in pending band → start new round from same item succeeds.
  - Two-peer: host discards mid-flight → voter auto-navs Lobby silently (no toast) within 500ms.
- **Manual smoke (host + voter peer):**
  - Reveal with linked agenda item → item moves to consumed band.
  - Skip with linked agenda item → item moves to consumed band.
  - Discard re-vote round → parent's terminal state and consumed item unchanged.

No telemetry (ADR-0028).

## Screenshots

**Required:** Yes

- Estimating header — host view (back chevron visible).
- Estimating header — voter view (no back chevron).
- Lobby agenda list — item in pending band after discard.

Variants: light + dark; mobile viewport. Standard harness via lefthook pre-push.

## Screenshot tags

`@agenda|@estimating`

Rationale: change touches Estimating header (host vs voter chevron) and Lobby agenda surfaces (post-discard pending state). Catalog tags confirmed (`packages/e2e/README.md`).

## References

- Spec: [docs/specs/agenda-item-orphaned-consumed-fix.md](../specs/agenda-item-orphaned-consumed-fix.md)
- Issue: https://github.com/IIxauII/hnch/issues/299
- ADR-0042 (pre-session agenda) — `adr/0042-pre-session-agenda.md`
- ADR-0040 (skip semantics) — `adr/0040-skipped-rounds.md`
- ADR-0036 (participant removal lifecycle) — `adr/0036-participant-removal-lifecycle.md` (precedent we deliberately don't follow)
- ADR-0013 (rounds list) — `adr/0013-round-model-flat-parentroundid.md`
- ADR-0010 (host election) — `adr/0010-host-election.md`
- Code refs: `packages/client/src/app/lobby/lobby.page.ts:975-1036`, `packages/shared/src/doc-projection.ts:504-565,792-836`, `packages/client/src/app/estimating/estimating.page.ts:100-700`, `packages/cli/src/session.ts:300-345`
