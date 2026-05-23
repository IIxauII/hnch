# Consensus celebration unreliable fire — fix plan

**Status:** Draft
**Date:** 2026-05-23
**Source spec:** `docs/specs/consensus-celebration-unreliable-fire.md`
**Shape:** Single PR

## Summary

Identity-guard the round-reset effect in `CelebrationService` so projection ticks that re-emit the same revealed round don't wipe an in-flight celebration. Restores reliable consensus overlay firing on unanimous auto-reveal (regressed by #308 removing the CSS-animation masking that hid the pre-existing race).

## Approach

**Root cause:** `packages/client/src/app/core/celebration.service.ts:79-87` runs `stopConfetti()` + `showOverlay.set(false)` + `clearAllTimers()` + `previousConsensus=false` **unconditionally** whenever the tracked `_round()` signal emits. The `void (r?.id ?? null)` line is a no-op — there is no early-return guard.

`doc.service.ts` writes a fresh `DocProjection` reference into `projection` on **every** `observeDeep` callback (awareness deltas, vote settles, participant heartbeats, snapshot patches). `rounds()` re-emits a new array of new `Round` objects each tick. `lobby.page.ts:1161-1167`'s `effect(() => this.celebration.setRound(this.lastRevealedRound()))` therefore feeds the service a new-reference-same-id round on every tick.

Result: reset fires on every tick after reveal, cancelling the 200 ms arming delay and any in-flight 3 s display window. Race is intermittent — sometimes a tick lands during the brief window where the overlay just became visible; sometimes during the arming delay (kills before show). Pre-#308 the CSS-animation pieces had already painted by the time reset hit, so reveals "kinda worked". #308's imperative WAAPI engine is hard-killed by `attachLayer(null)` when the `@if` collapses, so reveals now look fully blank most of the time.

**Fix:** track `lastRoundId: string | null = null` on the service; in the reset effect, early-return when the new round's id matches the last seen id **and** the last seen id is non-null. Exact guard expression:

```ts
const nextId = r?.id ?? null;
if (nextId !== null && nextId === this.lastRoundId) return;
this.lastRoundId = nextId;
// existing reset body: stopConfetti / showOverlay.set(false) / clearAllTimers / previousConsensus = false
```

Null-to-null self-ticks (clear → clear) skip the reset; non-null-to-null (clear after a round) still runs the reset; non-null-to-same-non-null (projection rebuild, same id) skips; transitions to a different non-null id run the reset. The celebration effect is left unchanged — `previousConsensus` edge-detection already does the right thing once the reset stops firing spuriously.

Visual baseline (no change expected from these scenes):

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-01-pre-reveal-estimating.png?raw=true

## ADR impact

- None — pure client bug fix. No change to ADR-0018 (reveal protocol), no schema change, no relay change.

## Decisions resolved

1. **Fix layer.** Considered (A) celebration.service.ts only, (B) lobby.page.ts caller wiring, (C) doc.service.ts projection memoization. **Chose A.** Lowest blast radius — one file, one effect; doesn't push invariant onto callers; doesn't ripple into other projection consumers.
2. **Identity-guard mechanism.** Considered (A) `lastRoundId` field + early return, (B) `setRound(id, data)` API split, (C) explicit `armForRound(id)` event method. **Chose A.** Mirrors pre-#308 `lastObservedRoundId` pattern; reviewer-friendly; no API change.
3. **Harden celebration effect against same-round re-fires too?** Considered (A) no (rely on reset fix), (B) belt-and-suspenders `lastArmedRoundId`. **Chose A.** `previousConsensus` edge-detection becomes sufficient once reset stops thrashing.
4. **Keep #308 WAAPI engine / attachLayer plumbing.** Considered (A) keep, (B) refactor to always-mounted layer. **Chose A.** Race is upstream; engine works correctly once not torn down spuriously.
5. **Regression test shape.** Considered (A) unit with fake timers, (B) unit + e2e 10-cycle loop, (C) e2e only. **Chose A.** Deterministic; e2e would be slow and Playwright auto-wait can mask intermittent failures.
6. **Resolve pre-existing UU merge conflict in vote-results.component.{ts,test.ts}.** User confirmed cleanup runs **before** branching (restore from HEAD, ff-only pull, drop stash). So the conflict is gone by the time the worktree is created — not part of the fix PR diff.

## Pre-work (do before creating the worktree)

Run from the primary checkout, on `main`:

```bash
git checkout HEAD -- packages/client/src/app/shared/vote-results.component.ts packages/client/src/app/shared/vote-results.component.test.ts
git pull --ff-only origin main
git stash drop stash@{0}   # the "wip-before-main-sync" stash
```

This resolves the leftover UU index state (interrupted `stash pop`), syncs local `main` from 7-behind to current, and drops the obsolete stash. After this, working tree is clean and `main` is at `d0655c9` or later.

## Phases

### Phase 1 — Identity-guard reset effect (single PR)

- **Scope:**
  - `packages/client/src/app/core/celebration.service.ts` — add `lastRoundId` field; early-return in reset effect per the exact guard above; update field on transitions
  - `packages/client/src/app/core/celebration.service.test.ts` — new tests (all must call `setRound` with a **new object reference** each tick — e.g. `setRound({ ...round })` — to mimic the doc projection rebuild; calling with the same ref is a signal-equality no-op that would pass against the buggy code too):
    - **Test A (race regression):** simulate same-id re-emit across 1500 ms with `vi.useFakeTimers()`, ticking projection every 50 ms; assert overlay fires exactly once after the arming delay, persists through the 3 s window, then hides
    - **Test B (AC-12 regression guard):** different-id round arrives mid-window; assert overlay cancels
    - **Test C (null-cycle remount):** `setRound(round)` → `setRound(null)` → `setRound(sameRound)` exercises clear-then-replay; assert overlay re-arms on the re-set
  - Verify Test A **fails against the current `origin/main` celebration.service.ts** before applying the fix; record this in the commit message ("test fails on parent commit, passes on this commit")
- **Exit bar:**
  - Unit tests A/B/C pass locally and in CI
  - Manual smoke: 2 browser windows, 10 consecutive unanimous **auto-reveals** — overlay fires every time
  - Manual smoke: 1 round where host manually taps Reveal on a unanimous vote — celebration still fires (incidental coverage of manual-reveal path)
  - `@reveal`-tagged screenshot subset under `packages/e2e/tests/_screenshots/reveal/` produces non-blank consensus scenes (diff matches `docs/screenshots/latest/reveal/consensus-*.png`)
  - Type-check, lint, build clean
- **PR title scope:** `fix(client): ...` (single-package change)
- **Worktree:** `pnpm worktree:add consensus-celebration-unreliable-fire main` at execution time (after pre-work cleanup above)
- **Depends on:** none

## Open questions

- **Late-join overlay replay window (deferred).** Late joiner sees a round that is already revealed in the snapshot; today the celebration effect arms whenever `consensus()` is true regardless of how long ago `revealedAt` was set. A peer joining 10 minutes post-reveal would still see a burst replay. Whether to gate this behind `Date.now() - revealedAt < CELEBRATION_WINDOW_MS` is pre-existing behavior (not introduced or worsened by this fix) and is tracked separately from #310. Manual smoke should note observed behavior but not act on it in this PR.

## Critique resolutions

- **Reduced-motion same-id guard.** Closed: no extra test needed. Reduced-motion path is driven by the same `showOverlay()` signal flipping true; once the reset early-return prevents the cancel, both motion and reduced-motion variants are covered by Test A. The existing reduced-motion behavior tests still apply.
- **C1 skip-after-reveal cancellation test.** Rejected as too rare to warrant dedicated coverage. ADR-0040 acknowledges revealed/skipped coexistence via CRDT merge, but the host-handoff partition required to produce a same-id revealed→skipped flip mid-celebration is extremely unlikely in practice. AC-17 cancel path (lines 125–131 in `celebration.service.ts`) is unchanged code; existing different-id cancel test (Test B) exercises the same effect branch.
- **C8 stash inspection.** Rejected. User confirmed the stash@{0} ("wip-before-main-sync") contents are known.

## Verification plan

**Phase 1:**

- `pnpm --filter @xauyxau/hnch-client test celebration.service` — unit suite passes including new race-regression test
- `pnpm --filter @xauyxau/hnch-client test vote-results.component` — no regression in the presenter tests
- `pnpm --filter @xauyxau/hnch-client typecheck`
- `pnpm --filter @xauyxau/hnch-client lint`
- `pnpm --filter @xauyxau/hnch-client build`
- Manual: open `pnpm dev:client` + `pnpm dev:relay` in worktree, two browser windows, vote unanimous 10× → overlay visible every cycle
- Pre-push hook runs `@reveal`-tagged screenshot subset; sticky PR comment screenshots match canonical `docs/screenshots/latest/reveal/consensus-*.png` shape (overlay rendered, not blank)

## Screenshots

**Required:** No (reliability fix, zero visual change intended)

- Reason: spec explicitly scopes out visual changes; gravity-burst look, badge, scrim, dismiss timing, reduced-motion fallback all unchanged
- The `@reveal` pre-push subset still runs as part of regression-guard (catches accidental visual regression and proves overlay actually fires in the captured spec)

## Screenshot tags

`@reveal`

Rationale: change is on the consensus celebration trigger path. Targeted `@reveal` subset captures both the gravity-burst patterns (`burst {center,top-sprinkle,side-cannons}`) and the four reduced-motion variants under `packages/e2e/tests/_screenshots/reveal-transition.spec.ts`. Blank captures indicate regression.

## References

- Spec: `docs/specs/consensus-celebration-unreliable-fire.md`
- Issue: https://github.com/IIxauII/hnch/issues/310
- Prior first-reveal arm: #293 (`fbc638d`)
- Gravity-burst rework that exposed the race: #308 (`6ab2a3a`)
- ADR-0018 — manual reveal + unanimous auto-reveal
- ADR-0040 — skip round (terminal-state coexistence with reveal)
- Adjacent (shipped) plan: `docs/plans/celebration-overlay-fix.md`

## Follow-ups (post-merge)

- **Projection-layer structural-equality memoization.** `doc.service.ts` rewrites `projection` to a fresh `DocProjection` on every `observeDeep` callback (awareness deltas, heartbeats, vote settles), and `rounds()` returns a new array of new `Round` objects each tick. This forces every downstream computed and effect that touches `rounds()` to re-evaluate even when nothing semantically changed. The celebration race is one symptom of this signal-thrash class — others may be lurking (UI flicker on awareness churn, focus drops, perf cost on large rooms). File a GH issue after this fix merges to track memoizing the projection layer (or adding `equal` to the relevant signals) so the class is fixed at source.
