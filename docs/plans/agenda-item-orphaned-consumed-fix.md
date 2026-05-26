# Defer agenda consume to round terminal + host-discard back chevron

**Status:** Draft
**Date:** 2026-05-23
**Source spec:** [docs/specs/agenda-item-orphaned-consumed-fix.md](../specs/agenda-item-orphaned-consumed-fix.md)
**Shape:** Single PR

## Summary

Fixes #299. Agenda items currently consume at round-start, which orphans them as `consumed` whenever a host backs out of Estimating before reveal/skip — and the back chevron itself is a no-op because Lobby's auto-nav bounces a non-terminal `currentRound` straight back. Ships three coupled changes in one PR: (1) move `consumeAgendaItem` from round-start to terminal (reveal/skip) inside the shared writers, (2) introduce a `discardedAt` tombstone on Round (with `discardedBy: peerId`) so the host back chevron writes a real discard, (3) extend `terminalState()` so all 20 consumers auto-treat discard as terminal and the host's back gesture actually exits.

## Approach

Schema-first. Extend the Round record with `discardedAt: number` and `discardedBy: peerId`. Add `discardRound(doc, roundId, ts, peerId)` writer in `@hnch/shared` (guards against re-entry on already-terminal rounds; CRDT-merged late writes tolerated as no-ops). Modify `revealRound` and `skipRound` to look up `round.agendaItemId` and, if present and currently `pending`, call `setAgendaItemState(..., 'consumed')` inside the same `Y.transact` — single transaction, automatic CLI/client parity. **Consume is idempotent at the writer level**: re-vote rounds inherit `agendaItemId` from a parent that already consumed; reveal/skip on those rounds must NOT throw and must NOT re-write `consumedAt`. Drop the standalone `consumeAgendaItem` call from `lobby.page.ts:onRoundStart` and from CLI `session.newRound`. Extend `terminalState()` to return `'revealed' | 'skipped' | 'discarded' | null`.

**Tie-break (C9 resolved):** earliest-timestamp-wins extends uniformly to all three terminal fields. If two of `revealedAt`/`skippedAt`/`discardedAt` are set on a CRDT-merged round, the earliest timestamp wins — same rule as ADR-0040, now spanning three fields. This means a 1ms-late discard against an auto-reveal will lose; the spec's "delete-wins" framing applies to late VOTES merging into an already-terminal round (those votes are projection-ignored regardless of terminal kind), not to terminal-vs-terminal merges.

**`currentRound()` fallback (C2 resolved):** when no active (non-terminal) round exists, fall back to the last NON-DISCARDED round in the array — never return a discarded tombstone, even if it is the last array element. This preserves the Lobby/results "last revealed round" anchor for VoteResults.

**Late-vote race:** votes merged after `discardedAt` is set are projection-ignored because the round is excluded from `currentRound()` and all history surfaces. No tombstone resurrection. Coverage moved from e2e to a shared unit test that manually constructs a Yjs merge of discard + vote (deterministic; C4 resolved).

**Field-default discipline (C7 resolved):** all new `discardedAt`/`discardedBy` checks use `=== undefined`, never truthy checks (defends against legacy `discardedAt: 0`).

Client: Estimating header back chevron becomes `@if (isHost() || terminalState(currentRound()) !== null)`. Host-tap path branches in `softExit()` — if active round and host, call `docService.discardRound(round.id)` then navigate; otherwise existing nav. Voter/viewer: chevron hidden during active round, resurfaces after terminal. CLI: add `[d]` keypress in `Voting.tsx` (host-only, mirrors `[r]`/`[s]`), wire `onDiscard` up to a new `discardCurrentRound()` session mutation.

Two new ADRs (per D2 + spec): one supersedes ADR-0042 (lifecycle: consume-at-terminal), one supersedes ADR-0013 (round record restates revealedAt/skippedAt/discardedAt + delete-wins projection semantics). ADR-0040 unchanged.

Visual baseline (current state, pre-fix):
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/agenda/agenda-items-list.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/agenda/agenda-pending.png?raw=true

## ADR impact

- **ADR-0042 (pre-session agenda)** — superseded. New ADR documents consume-at-terminal lifecycle + that discard leaves item pending.
- **ADR-0013 (round model, flat parentRoundId)** — superseded. New ADR restates the round record with three terminal-ish fields (`revealedAt`, `skippedAt`, `discardedAt`); codifies earliest-timestamp-wins tie-break uniformly across all three (C9); excludes any round with any terminal field from active state; specifies that `parentRoundId` MUST NOT point at a round with `discardedAt` set (C6) — enforced by a writer guard in `addRound` that rejects a discarded parent.
- **ADR-0040 (skip semantics)** — unchanged. Discard is distinct from skip: no `skippedAt` written, no history entry, no terminal projection in the reveal/skip tie-break sense.

## Decisions resolved

1. **`discardedBy` peer-ID on the tombstone?** → Yes, write `discardedBy: peerId` alongside `discardedAt`. Parallels participants' `removedBy`. Captured now even with no immediate UI, so an audit/attribution surface later requires no schema change.
2. **ADR-0013 — supersede, amend, or roll into 0042 supersession?** → Supersede 0013 with a clean restatement of the round record (all three terminal-ish fields). Two new ADRs total; concerns stay separated.
3. **Round-terminal helper shape** → Extend `terminalState()` to return `'discarded'` in addition to existing values. One chokepoint funnels all 20 consumers; no second helper to forget.
4. **Where does reveal/skip → consumeAgendaItem live?** → Inside shared `revealRound`/`skipRound`. Single `Y.transact` per writer; CLI and client parity automatic; impossible to forget in a future consumer.
5. **PR shape** → Single PR. 8 SP, schema + projection + ADRs + client + CLI + e2e tightly interlocked; phasing would leave schema unused in `main` between PRs and ship ADR before behavior.
6. **Screenshot scope** → Tags `@host|@layout|@participants` (covers `agenda-states.spec.ts` + estimating-header). Variants: agenda-pending, estimating-header-host (with back chevron), estimating-header-voter (no back chevron during active round), lobby-after-discard.
7. **CLI host discard command** → Yes, add `[d]` keypress in `Voting.tsx`. Host-only guard, mirrors `[r]`/`[s]`. Wires `onDiscard` → new `discardCurrentRound()` mutation. Keeps CLI at feature parity with client.

## Phases

### Phase 1 — Single PR: schema + writers + ADRs + client + CLI + e2e

- **Scope (packages/shared):**
  - `packages/shared/src/doc-projection.ts`: extend `ROUND_FIELDS` with `'discardedAt'` and `'discardedBy'`; add `discardRound(doc, roundId, ts, peerId)` writer (guard: throws if any terminal field already set on local read; tolerant to CRDT-merged late writes); extend `terminalState()` to return `'discarded'` with earliest-timestamp tie-break extended uniformly across all three terminal fields (C9); update `currentRound()` to skip rounds with any of `revealedAt|skippedAt|discardedAt` AND fall back to last NON-DISCARDED round (never a tombstone) when none active (C2); modify `revealRound`/`skipRound` to consume linked agenda item inside the same `Y.transact` ONLY when `round.agendaItemId` is present AND the agenda item is currently `pending` — idempotent no-op otherwise so re-vote reveal does not throw (C1); add `addRound` writer guard rejecting any `parentRoundId` that points at a round with `discardedAt` set (C6); use `=== undefined` checks for all new fields (C7); drop the now-redundant `consumeAgendaItem('pending' → 'consumed')` writer call from lobby's round-start path.
  - `packages/shared/src/lineage.ts`: filter rounds with `discardedAt !== undefined` out of `chainRoot`/`descendants` walks (C6).
  - `packages/shared/src/doc-projection.test.ts`: extend the 5 existing `terminalState` cases to a covering matrix — discarded-only, discarded-vs-revealed (both orderings), discarded-vs-skipped (both orderings), all-three CRDT merge, `discardedAt: 0` still treated as terminal (C7); new tests for `discardRound` guards; `revealRound`/`skipRound` atomic consume tests including the re-vote-of-already-consumed case (must succeed, no re-write) (C1); `currentRound()` fallback test where last array element is discarded (C2); late-vote race test that manually constructs a Yjs merge of discard + vote and asserts no resurrection (C4); `addRound` writer rejects discarded parent (C6).
- **Scope (adr/):**
  - New ADR superseding ADR-0042 (agenda consume-at-terminal lifecycle).
  - New ADR superseding ADR-0013 (round record restatement + delete-wins projection).
  - Update `adr/README.md` index.
  - Update `docs/schema.md` cross-link for the new round fields.
- **Scope (packages/client):**
  - `packages/client/src/app/core/doc/doc.service.ts`: add `discardRound(roundId)` method delegating to shared writer with current peerId.
  - `packages/client/src/app/lobby/lobby.page.ts`: drop the explicit `consumeAgendaItem` call from `onRoundStart` (~line 1222 — round-start now writes round only); add code comment cross-referencing the new ADR.
  - `packages/client/src/app/estimating/estimating.page.ts`: branch `softExit` on `isHost() && !terminalState(currentRound())` → call `docService.discardRound(round.id)` then navigate; existing nav otherwise.
  - `packages/client/src/app/estimating/estimating.page.html`: gate back chevron with `@if (isHost() || terminalState(currentRound()) !== null)` so voters/viewers don't see it during an active round.
- **Scope (packages/cli):**
  - `packages/cli/src/session.ts`: drop `consumeAgendaItem` call from `newRound` (~line 322 — now lives in shared writers); add `discardCurrentRound()` mutation.
  - `packages/cli/src/ui/Voting.tsx`: add `[d]` keypress in `useInput` handler (host-only guard, mirrors `[r]`/`[s]`); add hint to the keypress legend.
  - `packages/cli/src/ui/App.tsx`: wire `onDiscard={() => session.discardCurrentRound()}` into the `Voting` component mount; no auto-nav loop change needed (synchronous `deriveScreen` re-evaluates `terminalState` next render).
- **Scope (packages/e2e):**
  - New `packages/e2e/tests/host-discard-round.spec.ts` (tag `@host`):
    - Host starts round from agenda item → back chevron → lands Lobby → agenda item still `pending` → start new round from same item succeeds.
    - Non-host: back chevron not visible during active round.
    - Reveal still consumes: start from agenda → reveal → item `consumed`.
    - Skip still consumes: start from agenda → skip → item `consumed`.
    - Re-vote of an already-consumed agenda item: reveal succeeds, no second consume write (C1).
  - Late-vote race moved to shared unit test (deterministic Yjs merge construction); NOT in e2e (C4).
  - Update `_screenshots/agenda-states.spec.ts` to capture the post-discard `pending` state.
  - Run new spec 5× to flake-check before merge.
- **Exit bar:**
  - All `verify` jobs green (vitest matrix shared+client+cli, lint, typecheck, build).
  - `e2e` chromium full suite green; new `host-discard-round.spec.ts` green in 5 consecutive runs.
  - Screenshots published on push; PR comment shows new variants.
  - Both new ADRs Accepted (reviewed pre-merge).
  - **Consumer audit (C3):** `rg -n 'revealedAt|skippedAt' packages/client/src packages/cli/src packages/shared/src` reviewed; every direct read either funneled through `terminalState()` or annotated with one-line rationale for direct-read safety. Audit log committed as a comment block in the PR description (not a doc file).
- **PR title scope:** `fix(shared,client,cli,e2e): defer agenda consume to terminal + host discard chevron` — verify with `git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u` before push, cross-referenced against the PR-title-lint allowlist. If `adr/` or `docs/` need explicit scopes per allowlist, extend title accordingly (C8).
- **Worktree:** `pnpm worktree:add agenda-item-orphaned-consumed-fix main` at execution time (after `git fetch origin`).
- **Depends on:** none.

## Open questions

- Storage cost of keeping tombstoned rounds in the doc — bounded in practice (manual host action, low frequency) but at execution time confirm no projection hot path scales with the tombstone count (specifically: `currentRound()` and history reads should remain O(rounds), not re-scan-on-every-render). Quick perf sanity check during PR review.
- Whether the ADR superseding 0013 should pre-include a section on hypothetical `discardedBy` UI (kick-style attribution) or leave it as a future ADR — defer to ADR draft review.

## Critique rejected

- **C5 (host-transfer-mid-discard):** Edge of edge — requires manual host back-tap exactly at the instant of disconnect. Coverage cost (election timing test harness) exceeds value. Existing ADR-0010 election + synchronous `isHost()` flip already covers the post-election state; pre-election 5-second window is the same hung-Estimating window any other dropped-host scenario produces, not unique to discard.

## Verification plan

- **Unit (shared):**
  - `discardRound`: throws when `revealedAt`/`skippedAt`/`discardedAt` already set locally; succeeds with timestamp+peerId; tolerant to concurrent CRDT-merged terminal write (no throw on remote merge).
  - `terminalState()`: returns `'discarded'` for discard-only; returns earliest-terminal value for CRDT-merged cases (extend existing 5 cases to a covering matrix).
  - `currentRound()`: skips rounds with any terminal field; returns next active round if multiple exist.
  - `revealRound`/`skipRound`: atomically consume linked agenda item when `agendaItemId` set; no-op consume when absent.
- **Unit (client):**
  - `DocService.discardRound` delegates with current peerId.
  - Lobby `onRoundStart` no longer writes `consumeAgendaItem`.
  - Estimating `softExit` branches on host + active round.
  - Voter Estimating page with a doc where the latest round is `discardedAt`: nav'd to Lobby within one effect cycle; back chevron never visible (C10).
- **Unit (cli):**
  - `session.newRound` no longer consumes.
  - `session.discardCurrentRound` writes `discardedAt` + `discardedBy`.
- **E2e:** five-spec scenario set above; flake-check 5×.
- **Lint + typecheck + build:** shared, client, cli, e2e all green.
- **No telemetry assertions** (ADR-0028).

## Screenshots

**Required:** Yes

- **Screens / variants:**
  - `agenda-pending` (post-discard the item is still selectable).
  - `estimating-header-host` (back chevron visible during active round).
  - `estimating-header-voter` (back chevron hidden during active round).
  - `lobby-after-discard` (agenda item back in pending row).
- **Variants:** light + dark, mobile + portal where the existing `_screenshots/agenda-states.spec.ts` already captures both.
- **Path:** `docs/screenshots/<sha>/agenda/` and `docs/screenshots/<sha>/estimating-header/` (auto via screenshot harness on push).
- **Delivery:** PR comment auto-updated by `lefthook` pre-push hook (sticky comment marker `<!-- hnch-screenshots -->`); uses `blob/...?raw=true` embed pattern. No manual delivery.
- **Merge handling:** screenshot commits live on the dedicated `screenshots` branch — no squash/drop needed on PR merge.

## Screenshot tags

`@host|@layout|@participants`

Rationale: change touches agenda lifecycle (covered by `agenda-states.spec.ts` tagged `@host @layout @participants`) and Estimating header back-chevron visibility (host vs voter variants).

## References

- Spec: `docs/specs/agenda-item-orphaned-consumed-fix.md`
- Issue: https://github.com/IIxauII/hnch/issues/299
- ADRs: `adr/0010-host-election.md`, `adr/0013-round-model-flat-parentroundid.md`, `adr/0040-skipped-rounds.md`, `adr/0042-pre-session-agenda.md`
- Code refs:
  - `packages/shared/src/doc-projection.ts` (`ROUND_FIELDS` ~105, `revealRound` ~536, `skipRound` ~553, `currentRound` ~627, `setAgendaItemState` ~792, `consumeAgendaItem` ~829)
  - `packages/client/src/app/lobby/lobby.page.ts` (auto-nav ~1174, `onRoundStart` ~1222, `onRevote` ~1250, `softExit` ~1528)
  - `packages/client/src/app/estimating/estimating.page.ts` (`isHost` ~509, `onReveal` ~642, `softExit` ~658, `onSkip` ~755)
  - `packages/client/src/app/estimating/estimating.page.html` (Reveal footer ~214; back chevron template TBD at execution)
  - `packages/cli/src/session.ts` (`newRound` ~322, `skip` ~317)
  - `packages/cli/src/ui/Voting.tsx` (`useInput` ~80, hints ~150)
  - `packages/cli/src/ui/App.tsx` (`deriveScreen` ~38, `Voting` mount ~512)
  - `packages/e2e/tests/agenda.spec.ts`, `packages/e2e/tests/fixtures/app.fixture.ts`, `packages/e2e/tests/_screenshots/agenda-states.spec.ts`
- Tests: `packages/shared/src/doc-projection.test.ts:536–557` (existing `terminalState` cases to extend)
