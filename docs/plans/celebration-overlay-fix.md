# Plan: Celebration overlay — page-scoped, accent text, fix first-reveal miss

**Estimate:** 5 SP
**Source spec:** `docs/specs/celebration-overlay-fix.md`
**Issue:** https://github.com/IIxauII/hnch/issues/291
**Branch shape:** single PR (small client + e2e change, scope `feat(client,e2e):` or `fix(client,e2e):`)

**PR boundary (post-critique C8):** PR ships ONLY `packages/client/**` and `packages/e2e/**` (plus `packages/client/src/theme/variables.scss` per T3). Spec/plan amendments resulting from T0 spike findings go in a separate `docs(specs|plans): …` commit, possibly folded into the same PR with `client,e2e,docs` scope; do not silently mix.

## Context

Celebration overlay shipped in #284 has two bugs visible on `main`:
1. **Clipped + ugly:** overlay positioned `absolute; inset: 0` against `VoteResultsComponent` (`position: relative` host) → bounded by component box → round-history section below crops lower half. Green pill badge clashes.
2. **Missing on first reveal:** celebration `effect()` at `vote-results.component.ts:507–536` depends on `voteGroups()` / `abstainedNames()` / `didntVoteNames()` computeds. On a live reveal (`round` input mutates in-place into revealed state), those computeds may not re-fire because their output shape doesn't change. `consensus` is captured as a closure constant before the 280 ms `setTimeout`. Page reload re-constructs the component fresh → computeds fire → overlay paints, masking the bug.

Fix: confirm root cause via investigation spike, rewire arming effect, reposition overlay at the Lobby level (sibling inside `ion-content`), restyle text to use `--ion-color-primary` with theme-aware backdrop alpha, re-baseline `reveal/consensus-*` scenes.

## User journey

1. Host + ≥1 voter, all cast same card → unanimous auto-reveal fires (ADR-0018).
2. Estimating navigates back to Lobby; `VoteResultsComponent` renders.
3. After `(totalGroups-1)*80+200` ms stagger delay, consensus celebration triggers:
   - Dimmed scrim covers `ion-content` area (toolbar stays visible + interactive).
   - "hnch'd!" bold accent-colored text with drop-shadow appears center, spring-scale-in.
   - Confetti streams from center; unbounded by results-card lower edge.
   - Haptic burst (notificationSuccess + impactMedium 120 ms after).
4. Auto-dismiss at ~3 s OR click-to-dismiss anywhere on scrim.
5. Reduced-motion: instant appearance, no confetti, static `🎉`.

Edge:
- Reload mid-celebration → overlay re-appears for remaining window (existing).
- Non-consensus reveal → no overlay (no regression).
- Skip / all-abstain → no overlay (ADR-0040/0041 guards already in `consensus()`).
- Toolbar back-tap during overlay → navigation succeeds (overlay below toolbar z-layer because `ion-header` is sibling above `ion-content` in DOM).

## Decisions resolved

**D1: PR shape** → **A) Single PR.** One review context, screenshots rebaseline only once. Scope `feat(client,e2e):` or `fix(client,e2e):`.

**D2: Mounting strategy for overlay** → **A) Move overlay rendering to LobbyPage** as sibling inside `ion-content`, `position: absolute; inset: 0`. Toolbar naturally above (sibling `ion-header`). No new deps. **Mechanism (resolved post-critique C4):** LIFT STATE UP — LobbyPage (or a new `CelebrationService`) owns `consensus()` / `showOverlay` / `confettiPieces` / `dismissOverlay()` / `reducedMotion` and the celebration `effect()`. VoteResultsComponent no longer owns celebration; it becomes a pure presenter for the results table. This collapses the first-reveal fix and the relocation into a single re-owner of state, removes the one-way-data/two-way-control coupling that `viewChild()` would have introduced, and lets the celebration effect depend directly on the upstream `round()` signal.

**D3: Root cause of missing-on-first-reveal** → **Investigate root cause first** before committing to fix shape. Run local repro, instrument `consensus()` and the effect at `vote-results.component.ts:507–536`, verify whether the effect re-fires on live false→true transition. Leading hypothesis: `previousConsensus` tracker armed on false→true. Confirm with repro evidence; surface findings to user before coding fix.

**D4: Badge styling** → **A) Accent-colored text, no background.** Backdrop scrim provides contrast.

**D5: Backdrop alpha for light theme** → **C) Theme-aware via `--hnch-backdrop-alpha` CSS var.** Light: `0.55` (in `:root`); dark: `0.45` (override in `:root.ion-palette-dark`). Reference via `rgba(0, 0, 0, var(--hnch-backdrop-alpha))`.

**D6: Text color** → `var(--ion-color-primary)` in both themes. Pairs with theme-aware backdrop alpha. Drop-shadow `0 2px 12px rgba(0,0,0,0.6)` retained for legibility.

**D7: Screenshot rebaseline approach** → **A) Update existing `reveal/consensus-motion-*` and `reveal/consensus-reduced-*` specs** in `packages/e2e/tests/_screenshots/reveal-transition.spec.ts` to correctly wait for `.consensus-overlay` before capture. No new scenes added.

**D8: Test surface update** → **A) Add AC-15 + AC-16** in `vote-results.component.test.ts` using the AC-12 harness pattern. AC-15: live `setInput` transition false→true arms overlay. AC-16: text uses `--ion-color-primary`, no background pill.

## Open questions (execution-time)

- **OQ-1 (RESOLVED post-critique C4):** lift state up. LobbyPage (or a new `CelebrationService` injected at the Lobby route) owns `consensus()` and the celebration `effect()`. No `viewChild` coupling.
- **OQ-2 (C3 deferred):** T5 e2e wait window — overlay visible only ~280 ms..~3280 ms; Playwright retry budget can drift. Run T5 + flake-check 5x as planned; if flake observed, fall back to exposing `data-celebration="active"` attribute + extending dismiss via test-only param.

## Spec

### Behavioral requirements

- Overlay mounts on first consensus reveal in a fresh session, no reload.
- Overlay covers `ion-content` viewport area on the active page (Lobby), excluding `ion-header`/`ion-toolbar`.
- Backdrop scrim, "hnch'd!" badge, confetti, click-to-dismiss, ~3 s auto-dismiss, haptics, reduced-motion all preserved.
- Toolbar back-chevron remains visible and tappable during overlay.
- Badge has no background pill; bold accent-colored text + drop-shadow.

### Interfaces

- `VoteResultsComponent` exposes public signals: `consensus()`, `showOverlay()`, `confettiPieces()`, `dismissOverlay()` (existing).
- D2-A mechanism per OQ-1: LobbyPage reads VoteResults state (preferred: `viewChild()` ref) and renders the overlay template at LobbyPage level inside `<ion-content>`.
- Selectors `.consensus-overlay`, `.confetti-layer`, `.consensus-text` preserved (existing tests + e2e rely on them).

### Data flow

- `round.revealedAt` becomes defined → `consensus()` computed evaluates true → celebration `effect()` observes `consensus()` transition false→true (tracks `previousConsensus`) → schedules timer → `showOverlay.set(true)` → LobbyPage template renders `<div class="consensus-overlay">` inside `ion-content` → confetti scheduler starts → 3 s timer dismisses.

### Edge cases

- Round swap mid-celebration: round-change effect already clears timers + overlay (AC-12 preserves).
- All-abstain: `consensus()` returns false (ADR-0041 §2).
- Skip: `consensus()` returns false (ADR-0040).
- Viewer participant: overlay still renders (AC-14).
- Reduced-motion: no confetti, no scale animation, static `🎉` glyph appears.
- Reload mid-celebration: existing path re-evaluates `consensus()` on mount.

## Acceptance criteria

- [ ] AC-1: On a 3-voter unanimous reveal, overlay paints within 1 s of `/lobby` navigation without reload.
- [ ] AC-2: Overlay scrim spans `ion-content` bounding box; round-history section below results card is fully scrimmed (no horizontal clip line at 1440×900 and 375×812).
- [ ] AC-3: Ionic toolbar back-button bounding box is NOT scrimmed and is hit-test reachable while overlay is active.
- [ ] AC-4: Badge `.consensus-text` computed `background-color` is `transparent` / `rgba(0,0,0,0)`.
- [ ] AC-5: Badge `.consensus-text` `color` resolves to `var(--ion-color-primary)` in both color schemes.
- [ ] AC-6: Confetti pieces during 0–3 s window are visible at vertical positions below the original results-card lower edge (no clip).
- [ ] AC-7: Click on scrim dismisses overlay (preserved).
- [ ] AC-8: Auto-dismiss at ~3 s preserved.
- [ ] AC-9: `prefers-reduced-motion`: no confetti, static `🎉` glyph rendered.
- [ ] AC-10: Non-consensus reveal renders no `.consensus-overlay` (regression guard).
- [ ] AC-11 .. AC-14 from existing suite **redirected to the new celebration owner** (LobbyPage / CelebrationService) — assertions equivalent (overlay/confetti DOM, aria-live, viewer renders, round-swap cancel) but executed against the new host. Test file modifications expected (post-critique C1).
- [ ] AC-15: Live `round` input transition from non-revealed to revealed (`setInput` + advanceTimers) arms overlay without remount.
- [ ] AC-16: `.consensus-text` computed-style `background-color` is transparent AND `color` resolves to the accent primary.
- [ ] AC-17 (post-critique C6): If `consensus()` transitions true→false during the scheduled celebration delay or while overlay is active (e.g. skip arriving after reveal per ADR-0040 terminal-state merge), the pending `revealCelebrationTimer` is cancelled, `overlayDismissTimer` is cancelled, `stopConfetti()` runs, `showOverlay()` becomes false, and `previousConsensus` resets to false.
- [ ] AC-18 (post-critique C7): Unit test asserts `.consensus-text` contains the `🎉` glyph when `matchMedia('(prefers-reduced-motion: reduce)').matches` is stubbed true AND `showOverlay() === true`.
- [ ] `reveal/consensus-motion-*` and `reveal/consensus-reduced-*` baseline PNGs show the rendered overlay (no blank lobby).

## Phases / Stories

### Story 0: Investigation spike (D3 root-cause confirmation) — GATE

- [ ] **T0: Reproduce + instrument celebration effect** [sonnet]
  - Package: client
  - files-touched: `packages/client/src/app/shared/vote-results.component.ts` (temporary diagnostic logging, reverted before T1)
  - What: Build + run dev session locally. Reproduce the first-reveal miss on a fresh session (no reload). Add temporary `console.log` / `effect()` introspection at `vote-results.component.ts:507–536` to verify: (a) does the celebration `effect()` re-fire on live `round` input mutation false→true? (b) is `consensus()` evaluating true at the moment of the timer scheduling? (c) is the closure-captured `consensus` constant the failure path? Surface findings to user before T1.
  - **Exit bar:** root cause confirmed AND fix shape chosen by user. No code change in T1 onward until exit bar met.
  - **Outcomes table (post-critique C5):**
    | T0 finding | Active tasks |
    |---|---|
    | (a) Real app bug — effect doesn't re-fire on live false→true | T1 + T2 + T3 + T4 + T5 (full plan) |
    | (b) E2e harness samples pre-overlay frame; app renders fine | T3 (visual restyle) + T5 (wait fix) only; skip T1/T2/T4-AC-15/AC-17 |
    | (c) Both | Full plan |
  - blockedBy: —

### Story 1: First-reveal regression fix (VoteResultsComponent effect rewire)

- [ ] **T1: Rewire celebration effect per confirmed root cause** [sonnet]
  - Package: client
  - files-touched: `packages/client/src/app/shared/vote-results.component.ts` (remove celebration ownership), new celebration owner (LobbyPage or `packages/client/src/app/core/celebration.service.ts` per D2 lift-state-up)
  - What: Apply the fix shape chosen at T0 exit bar. Per D2 (post-critique C4): move celebration state (`showOverlay`, `confettiPieces`, `previousConsensus`, `revealCelebrationTimer`, `overlayDismissTimer`, `hapticFiredForRound`) and the celebration `effect()` out of VoteResultsComponent into the new owner. Leading hypothesis: track `previousConsensus` and arm on false→true transition of `consensus()`. Read `round().revealedAt` defensively. Keep round-change reset effect (AC-12).
    **Skip-race handling (post-critique C6):** Effect must also fire on true→false transitions: cancel `revealCelebrationTimer`, cancel `overlayDismissTimer`, call `stopConfetti()`, set `showOverlay.set(false)`, reset `previousConsensus = false`. Covers ADR-0040 skip-after-reveal merge case.
    Revert any T0 diagnostic logging.
  - AC: AC-1, AC-11, AC-12, AC-14, AC-15, AC-17
  - blockedBy: T0

### Story 2: Overlay relocation + restyle (LobbyPage host)

- [ ] **T2: Move overlay template to LobbyPage** [sonnet]
  - Package: client
  - files-touched: `packages/client/src/app/lobby/lobby.page.ts`, `packages/client/src/app/shared/vote-results.component.ts`, `packages/client/src/app/shared/vote-results.component.test.ts` (post-critique C1 — AC-11..14 redirect)
  - What: Remove `.consensus-overlay` + `.confetti-layer` template + handlers from VoteResultsComponent. Render overlay markup at LobbyPage as sibling of `<section class="results-section">` inside `<ion-content>`, position `absolute; inset: 0`. Bind to celebration state owned by the new owner from T1 (no `viewChild` coupling). Preserve selectors `.consensus-overlay`, `.confetti-layer`, `.consensus-text`. **Keep the reduced-motion `🎉` glyph inside the `.consensus-text` `@if (reducedMotion())` block during the move** (post-critique C7). Redirect AC-11..14 in `vote-results.component.test.ts` to the new owner (LobbyPage harness or service test) — assertions stay equivalent. Confirm toolbar stays uncovered.
  - AC: AC-2, AC-3, AC-6, AC-11, AC-12, AC-13, AC-14
  - blockedBy: T1 (file collision on vote-results.component.ts)

- [ ] **T3: Restyle badge — accent text + theme-aware scrim alpha** [haiku]
  - Package: client
  - files-touched: `packages/client/src/app/lobby/lobby.page.ts`, `packages/client/src/theme/variables.scss` (post-critique C2 — `:root.ion-palette-dark` cannot live in a component styles array)
  - What: In LobbyPage styles (where overlay now lives), remove `.consensus-text` `background` / `border-radius` / `padding` / `box-shadow` pill styling. Add `color: var(--ion-color-primary)`, `text-shadow: 0 2px 12px rgba(0,0,0,0.6)`. **In `packages/client/src/theme/variables.scss`** define `--hnch-backdrop-alpha: 0.55` under `:root` (default light) and override to `0.45` under `:root.ion-palette-dark`. Reference via `background: rgba(0,0,0,var(--hnch-backdrop-alpha))` on `.consensus-overlay`. Preserve keyframes + `prefers-reduced-motion` rule.
  - AC: AC-4, AC-5, AC-16
  - blockedBy: T2 (file collision on lobby.page.ts)

### Story 3: Test + screenshot updates

- [ ] **T4: Add AC-15 / AC-16 / AC-17 / AC-18 unit assertions** [haiku]
  - Package: client
  - files-touched: `packages/client/src/app/shared/vote-results.component.test.ts` AND/OR new test file for the celebration owner from T1 (LobbyPage harness or `celebration.service.test.ts`)
  - What:
    - AC-15: live transition false→true → `setInput` revealed round + `vi.advanceTimersByTime` → `.consensus-overlay` present at new owner. AC-12 harness pattern.
    - AC-16: badge `getComputedStyle().backgroundColor` transparent AND `color` resolves to `--ion-color-primary`.
    - AC-17 (post-critique C6): mount revealed-consensus round, advance partway into stagger delay, `setInput` round with `skippedAt` set (or terminalState() → 'skipped'); assert overlay never mounts AND timers cleared.
    - AC-18 (post-critique C7): stub `matchMedia('(prefers-reduced-motion: reduce)').matches = true`, mount consensus round, assert `.consensus-text` `textContent` contains `🎉` and `.confetti-piece` count is 0.
  - AC: AC-15, AC-16, AC-17, AC-18
  - blockedBy: T1, T2 (avoid race on vote-results.component.ts)

- [ ] **T5: Update reveal-transition e2e specs to await overlay** [haiku]
  - Package: e2e
  - files-touched: `packages/e2e/tests/_screenshots/reveal-transition.spec.ts`
  - What: In `runConsensusScene`, after `LOBBY.resultsSection` is visible, `await hostPage.locator('.consensus-overlay').waitFor({ state: 'visible' })` before the screenshot delay. Bump `waitForTimeout` after locator resolves to ~500 ms (motion) to land mid-celebration. Existing scenes only — no new files.
  - AC: e2e baseline shows overlay
  - blockedBy: T2, T3 (overlay must be at final location/style before re-baselining)

### Story 4: Verification (test-runner-haiku)

- Run `pnpm --filter @hnch/client test`.
- Lint + typecheck on `@hnch/client` + `@hnch/e2e`.
- Run e2e chromium `@reveal` subset.
- Capture fresh screenshots via `SCREENSHOT_CAPTURE=1 ... reveal-transition.spec.ts`; confirm overlay visible.
- Flake-check `reveal-transition.spec.ts` 5x re-run.
- Build `@hnch/client`.

## Parallelism timeline

```
T0 (sonnet, GATE) ─> T1 (sonnet) ─> T2 (sonnet) ─> T3 (haiku) ─> T5 (haiku) ─> Verification
                            └─────> T4 (haiku, blockedBy T1+T2) ─────────────┘
```

Critical path: T0 → T1 → T2 → T3 → T5 → Verification (length 6). T4 runs in parallel with T3/T5 once T2 finishes.

## Team recommendation

### Agent roster
| Agent | subagent_type | Stories | Spawn | Despawn |
|-------|---------------|---------|-------|---------|
| client-sonnet | client-sonnet | S0, S1, S2 | S0 start | after S2 review clean |
| client-haiku | client-haiku | S2 (T3), S3 (T4, T5) | S2 (T3) start | after S3 review clean |
| reviewer | reviewer | S1+ | S1 start | end |
| test-runner-haiku | test-runner-haiku | S4 | S4 start | end |

### Reviewer strategy
Single `reviewer` — single-component scope, no security surface, no schema change, no relay touch. S0 spike has no reviewable artifact (findings surfaced to user); review begins at S1.

### Concurrency timeline
```
S0: client-sonnet (1 agent, GATE) — user reviews findings before S1
S1: client-sonnet, reviewer (2 agents)
S2: client-sonnet (T2) → client-haiku (T3), reviewer (peak 3 agents — T2/T3 serialize on lobby.page.ts)
S3: client-haiku (T4 then T5), reviewer (2 agents)
S4: test-runner-haiku, reviewer (2 agents)
```
Peak: 3 concurrent agents. Well under the 6-agent ceiling.

## Screenshot tags

`@reveal`

## Key files reference

- `/Users/xau/Documents/projects/hnch/packages/client/src/app/shared/vote-results.component.ts` — celebration effect (lines 507–536), template (162–185), styles (360–414).
- `/Users/xau/Documents/projects/hnch/packages/client/src/app/shared/vote-results.component.test.ts` — AC-11/12/13/14 (lines 361–550), AC-12 live-transition harness (lines 463–495).
- `/Users/xau/Documents/projects/hnch/packages/client/src/app/lobby/lobby.page.ts` — `<ion-content>` (195–423), `<app-vote-results>` at 403 (import 84, imports array 163).
- `/Users/xau/Documents/projects/hnch/packages/client/src/theme/theme.service.ts` — `:root.ion-palette-dark` toggle (line 8).
- `/Users/xau/Documents/projects/hnch/packages/e2e/tests/_screenshots/reveal-transition.spec.ts` — `runConsensusScene` (154–242).
- `/Users/xau/Documents/projects/hnch/docs/specs/celebration-overlay-fix.md` — source spec.
