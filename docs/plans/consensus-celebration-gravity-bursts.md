# Consensus celebration: gravity-based emoji bursts

**Status:** Draft (revised after /critique pass 3)
**Date:** 2026-05-23
**Source spec:** [docs/specs/consensus-celebration-gravity-bursts.md](../specs/consensus-celebration-gravity-bursts.md)
**Shape:** Single PR

## Summary

Replace the current spiral confetti (polar angle + distance spawn in `CelebrationService`) with one of three gravity-based emoji bursts (center explosion, top sprinkle, side cannons) picked uniform-random per reveal. Particle count rises ~5× to ~150 (hard cap enforced). Motion changes from a single shared CSS `hnchdConfetti` keyframe to **per-particle computed-trajectory animations driven by the Web Animations API** (`Element.animate`). Spawn cadence driven by a self-rescheduling `setTimeout` chain — no `requestAnimationFrame` integration loop. Animations run on the compositor thread; main-thread cost is one `Element.animate` call per spawn, then zero. Text headline animation and reduced-motion behavior preserved.

## Approach

Visual anchor (post-reveal Lobby where overlay plays):
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true

### Why WAAPI instead of rAF

Trajectories are deterministic at spawn given `(x₀, y₀, vx, vy, g, lifetime)`. We don't need to mutate physics mid-flight (no wind gusts, no mouse interaction, no redirect). Pre-computing N sampled waypoints at spawn time and handing them to `Element.animate(...)` lets the compositor run the animation off the main thread — substantially cheaper than 60 Hz JS integration of 150 particles, and notably better on iOS Safari/WKWebView (Capacitor target) where WebKit's compositor pipeline is the best-optimized animation path. WAAPI also pauses cleanly on tab visibility change (per spec) and resumes when the tab returns, replacing the "silent backgrounded burst" trade-off we'd accepted under rAF.

### Owners on `main`

First-pass critique uncovered that celebration logic was extracted out of `VoteResultsComponent` (per ADR-0040 / `consensus-overlay-scope-to-component` work). Real owners on `main`:

- `packages/client/src/app/core/celebration.service.ts` — state + spawn lifecycle (currently spawns spiral via polar `{ angle, distance }` `ConfettiPiece`).
- `packages/client/src/app/lobby/lobby.page.ts` — overlay DOM (`.consensus-overlay > .confetti-layer > .confetti-piece` `@for`) + CSS `@keyframes hnchdConfetti` + `.confetti-piece` styles.

Plan acts on these two files plus their tests, plus a new engine module and a screenshot-spec edit.

### New module: `confetti-engine.ts`

`packages/client/src/app/core/confetti-engine.ts` — owns spawn scheduling, trajectory math, eviction, teardown. Pure TS, framework-agnostic, no Angular deps.

```ts
export type ConfettiPattern = 'center' | 'top-sprinkle' | 'side-cannons';

export interface ConfettiEngineOpts {
  viewportW: number;
  viewportH: number;
  emojis: readonly string[];
  /** Engine creates and owns child .confetti-piece nodes under this element. */
  layer: HTMLElement;
  /** Default: `(window as any).__confettiRng ?? Math.random`. Playwright sets the
   *  window hook in screenshot specs; production has no consumer. Injecting via
   *  opts overrides both (unit tests). Narrow seam — no global Math.random patch. */
  rng?: () => number;
  /** Default: 1800 px/s² */
  gravity?: number;
  /** Hard cap on simultaneous live animations. Default: 150. */
  maxParticles?: number;
}

export class ConfettiEngine {
  constructor(opts: ConfettiEngineOpts);
  start(pattern: ConfettiPattern): void;
  stop(): void;
  /** Read-only count for assertions. */
  liveCount(): number;
}
```

### Engine internals

- **State:** `private animations: Animation[]` (tracks every live `Animation` instance for batch `cancel()` on stop); `private spawnTimer: number | null` (setTimeout handle for the next scheduled spawn); `private startedAt: number` (overlay-relative t=0 in `performance.now`).
- **`start(pattern)`:** records `startedAt`, sets `pattern`, schedules first spawn at t=0. No rAF loop.
- **Spawn scheduler:** self-rescheduling `setTimeout` chain. Each tick:
  1. If `animations.length >= maxParticles` → reschedule and bail.
  2. Compute `t = now - startedAt`; if `t >= 2500` → stop scheduling (spawn window closed; tail particles continue animating to landing).
  3. Spawn one particle: pick initial state via `spawnOne(pattern, viewport, rng)`, compute trajectory keyframes + `lifetime`, call `el.animate(keyframes, { duration: lifetime, easing: 'linear', fill: 'forwards' })`, attach `animation.onfinish = () => evict(node, animation)`.
  4. Compute next delay from spawn-rate function `r(t)` → `nextDelay = 1000 / r(t)`; reschedule.
- **Trajectory math** — pure function `computeTrajectory(initialState, gravity, viewport): { keyframes, lifetime }`:
  - Solve landing time analytically: largest positive root of `y₀ + vy·t + ½·g·t² = viewport.h + 40` (or cap at 4000 ms).
  - Sample 15 evenly-spaced waypoints. Each waypoint = `{ transform: 'translate3d(x(t), y(t), 0) rotate(rot(t)deg)', opacity: fadeAt(t) }`. `fadeAt` linearly fades from 1 → 0 in last 200 ms.
  - Result keyframes start at `transform: translate3d(x₀, y₀, 0)` and end at landing point.
- **DOM nodes (per spawn):** `createElement('span')`, append to `layer`, set inline `position: absolute; top: 0; left: 0; line-height: 1; font-size: <px>; will-change: transform, opacity; text-content = emoji`. After spawn, `el.animate(...)` returns the `Animation`; push to `animations`. `animation.onfinish` removes node + splices animation out.
- **`stop()`:**
  1. Clear `spawnTimer` (no more spawns).
  2. **Remove every child node from `layer` FIRST** (DOM detach before animation teardown — fixes P3-C2 snap-back: `cancel()` resets to "before phase" transform, which on a still-attached node would flash particles to origin before paint; detaching first eliminates the repaint window).
  3. For every `Animation` in `animations`: `a.cancel()` (synchronous; safe now that nodes are detached).
  4. Clear `animations` array.
  5. Null internal `layer` ref → subsequent stray calls no-op.
- **Hard cap (in-flight):** spawn rejected when `animations.length >= maxParticles`. **Semantics:** cap applies to *simultaneous in-flight* animations, not total ever spawned. As eviction frees slots, late spawns can still happen — total ever-spawned across the 2.5 s window may slightly exceed 150 in theory, but with current cadence math (∫r(t) ≈ 138) it won't. The perf-meaningful metric is in-flight count; verification asserts that, not total (fixes P3-C6).
- **No `tick`, no `now` DI, no rAF.** Engine is mostly synchronous decision logic plus one DOM call per spawn. Tests construct engine + seeded rng + a `document.createElement('div')` as layer; `vi.useFakeTimers()` advances the setTimeout chain; assertions inspect `animations.length`, layer children, and animation keyframes (via `vi.spyOn(HTMLElement.prototype, 'animate')` if needed to capture the call arg).

### Spawn cadence

Steady stream, front-loaded taper. Total ~150 particles over a 2.5 s spawn window inside the overlay's 3 s lifetime. Last 500 ms: no spawn — existing animations finish.

```
r(t) = peakRate * (1 - t/window)^k    for t ∈ [0, 2500ms]
window = 2500ms; peakRate ≈ 110/s; k ≈ 1.0
∫₀^2.5 r(t) dt ≈ 138 → MAX_PARTICLES = 150 absorbs jitter
```

Implementation: `setTimeout(spawn, nextDelay)` where `nextDelay = Math.min(1000 / r(t), window - t + 10)` evaluated at current `t = performance.now() - startedAt`. The `Math.min` cap (fixes P3-C4) prevents a stale long-delay timer from outliving the spawn window even if `stop()` is somehow missed. Scheduler exits when `t >= window`.

### Pattern spawn functions

Pattern selection: `Math.floor(rng() * 3)` at `start()`. Each pattern is a pure `spawnOne(pattern, viewport, rng): InitialState` returning `{ x, y, vx, vy, rotationVel, size, emoji }`. Per-particle launch energy varies wide so reach is heterogeneous:

- **`center`** — `x = viewport.w/2`, `y = viewport.h * 0.45` (logo center). `angle = -π/2 + (rng-0.5) * π * 1.9` (full upper hemisphere). `speed = 400 + rng² * 900` px/s (low-skew — many soft, few hot).
- **`top-sprinkle`** — `x = rng * viewport.w`, `y = -20`. `vx = (rng-0.5) * 140`. `vy = 80 + rng * 220`.
- **`side-cannons`** — coin-flip side. Left: `x = -20`, `y = viewport.h * (0.33 + rng * 0.67)`, `speed = 350 + rng² * 700` (low-skew), `angle = -0.7 + rng * 0.6` (≈ -40° to -5° from +x). Right: mirror around `+x = viewport.w + 20` with negated `vx`. Wide spread means some particles barely reach 25% across, others past midline.

`rotationVel = (rng - 0.5) * 1500` deg/s — total rotation across `lifetime` is `rotationVel * lifetime / 1000`, baked into trajectory keyframes.

### Reduced-motion + hidden-tab

- `reducedMotion()` short-circuit in `start()` — no engine instantiation, no DOM writes.
- **Backgrounded tab:** WAAPI animations pause automatically with the document timeline; resume on visibility return. Spawn scheduler's `setTimeout` continues to fire on hidden tabs (browser-throttled to ~1 Hz, but in this 2.5 s window means ~2 spawns at most). The overlay's 3 s dismiss `setTimeout` keeps running on its own clock. Net behavior: hidden mid-burst → particles freeze mid-trajectory until visible, then resume; if overlay auto-dismisses while hidden → `engine.stop()` cancels animations cleanly. No `visibilitychange` handler needed.

### CelebrationService wiring changes

**Delete:**
- `ConfettiPiece` interface (`{ angle, distance, rotate, duration, delay }`).
- `confettiPieces` signal, `confettiPieceCounter`, `confettiEvictionTimers`, `confettiInterval`, `makeConfettiPiece()`, the `spawnBatch` / `schedulePieceEviction` / `addPieces` closures inside `startConfetti()`, and the `setInterval(…, 1000)` loop.
- (Keep `CONFETTI_EMOJIS` const — passed into the engine.)

**Replace with:**
- `private engine: ConfettiEngine | null = null;`
- `private layerEl: HTMLElement | null = null;`
- `private pendingPattern: ConfettiPattern | null = null;` — start-before-attach queue.
- `attachLayer(el: HTMLElement | null)` — public method called by `LobbyPage` via a `viewChild` signal effect. If `el` non-null and `pendingPattern` set: store layer, instantiate engine with `layer: el`, call `engine.start(pendingPattern)`, clear `pendingPattern`. If `el` null: synchronous teardown — `engine?.stop()` first, then `layerEl = null`, then `engine = null`.
- `detachLayer()` — alias for `attachLayer(null)`. Also called from LobbyPage `ngOnDestroy` as belt-and-suspenders.
- `startConfetti()` (gated by `reducedMotion`): pick pattern via injected rng, store in `pendingPattern`. If `layerEl != null`, instantiate engine + `engine.start(pattern)` immediately; otherwise leave queued.
- `stopConfetti()`: `engine?.stop(); engine = null; pendingPattern = null;`. Layer ref unchanged. **Service teardown order at every site:** `engine.stop()` first, then `showOverlay.set(false)` (template unmount happens last).
- Keep `showOverlay` signal, `consensus()` computed, `previousConsensus` edge tracking, all `setTimeout` fields and `clearAllTimers`.

**Teardown sites that must call `stopConfetti()`:**
1. `destroyRef.onDestroy` — already calls. Keep.
2. Round-change `effect()` — already calls. Keep.
3. Celebration `effect()` true→false transition (skip-after-reveal AC-17, ADR-0040). Keep.
4. `overlayDismissTimer` 3 s callback. Keep.
5. `dismissOverlay()` (user tap on overlay). Keep.

`confettiPieces()` signal removed from public API. LobbyPage template loses the `@for` over it.

### LobbyPage template + CSS changes

Template `@if (celebration.consensus() && celebration.showOverlay())` block:
- Keep `.consensus-overlay` wrapper with `(click)="celebration.dismissOverlay()"`.
- Replace `@for (piece … track piece.id) { <span … /> }` with empty `<div #confettiLayer class="confetti-layer" aria-hidden="true"></div>`. Engine owns its children. `aria-hidden="true"` keeps screen readers out of the engine-owned subtree.
- `confettiLayer = viewChild<ElementRef<HTMLElement>>('confettiLayer')`. **`afterRenderEffect`** (NOT a regular `effect` — Angular's `afterRenderEffect` is the idiomatic primitive for signal reads that touch the DOM, guaranteeing the read runs after view commit) calls `celebration.attachLayer(this.confettiLayer()?.nativeElement ?? null)` whenever the signal changes. Same effect handles attach + detach. LobbyPage `ngOnDestroy` also calls `celebration.detachLayer()` as belt-and-suspenders.

CSS:
- Delete `@keyframes hnchdConfetti`.
- Delete the entire `.confetti-piece` base rule — engine sets every property inline at spawn (composition cost per-particle-alive, not always-on).
- Delete `@media (prefers-reduced-motion: reduce) { .confetti-piece { display: none; } }` — orphaned without the base rule; `startConfetti` short-circuit is the only gate.
- **`.confetti-layer` rule kept verbatim**, including `position: absolute; inset: 0; pointer-events: none; z-index: 1001; overflow: hidden;` (fixes P3-C8). Trajectories terminate at `y = viewport.h + 40` — `overflow: hidden` clips them so they don't extend page scrollHeight. Verification adds a computed-style assertion.
- `.consensus-text` keyframes (`consensusScaleIn`, `consensusPulse`) — untouched.

### Existing guards preserved

- ADR-0041 §2 — all-abstain not a consensus. Untouched.
- ADR-0040 skip-race guard. Untouched.
- AC-17 skip-after-reveal cancellation. Untouched.
- Reload guard via `previousConsensus = false` baseline. Untouched.
- AC-12 round-swap cancellation: round `effect()` calls `stopConfetti()`. Engine teardown is synchronous; all animations cancelled before next event loop turn.

## ADR impact

None. Pure UX/client change inside `packages/client/src/app/core/` + `packages/client/src/app/lobby/`. No protocol, schema, identity, role, or relay surface touched. ADR-0040 / ADR-0041 / ADR-0028 guards intact. No new telemetry / no perf gates added.

## Decisions resolved

1. **Motion impl** — **Web Animations API (`Element.animate`)** with per-particle precomputed gravity trajectories (15 waypoints, linear easing). *Options considered:* rAF + per-frame integration / WAAPI / computed CSS keyframes / Canvas. *Why:* trajectories are deterministic at spawn; compositor-thread execution is cheaper than 60 Hz main-thread JS, especially on iOS WKWebView; auto-pause on tab visibility is a free win.
2. **Target particle count** — 150 hard cap. *Why:* 5× literal from issue; cap enforces budget even if cadence math drifts.
3. **Engine lifecycle owner** — separate `ConfettiEngine` class under `core/`. *Why:* keeps service focused on consensus + overlay lifecycle; engine framework-agnostic and unit-testable.
4. **Rendering strategy** — `el.animate(...)` per spawn; compositor handles motion. No per-frame signal updates, no rAF JS, no per-frame DOM writes. *Why:* lowest main-thread cost; WAAPI is the best-optimized path on WebKit.
5. **Spawn cadence** — steady stream, front-loaded taper via self-rescheduling `setTimeout` (`peakRate ≈ 110/s`, `k = 1.0`, 2.5 s window). *Why:* punchy entry, gentle trail; setTimeout chain is sufficient — no rAF needed when we're not integrating physics.
6. **Side-cannon launch energy** — wide spread (`speed = 350 + rng² * 700`). *Why:* user: "not all should have the same force" — heterogeneous reach.
7. **Hidden-tab behavior** — WAAPI auto-pauses, resumes on visibility return; spawn scheduler is throttled but harmless in the 2.5 s window. *Why:* spec-conformant, no manual handler.
8. **Testability** — pure trajectory-math unit tests + `vi.useFakeTimers()` to advance the spawn chain + `vi.spyOn(HTMLElement.prototype, 'animate')` if needed to capture animation calls. *Why:* no rAF means no clock DI, no `tick`/`start` split — engine is mostly synchronous logic.
9. **Screenshot pattern-pinning seam** — `(window as any).__confettiRng` window hook set by Playwright `page.addInitScript`; engine reads it as default rng. *Why:* narrow seam — Ionic / Angular / third-party `Math.random` consumers untouched (fixes the global-patch leak P2-C4).
10. **PR shape** — single PR. *Why:* one new module, two edits, two test edits, one e2e spec edit.
11. **PR scope** — `feat(client,e2e)`. *Why:* both packages modified.

## Critique resolution log — pass 3

- **P3-C1 (blocker) Accepted** — JSDOM polyfill in `packages/client/src/test-setup.ts`: define `HTMLElement.prototype.animate = vi.fn(() => fakeAnimation)` where `fakeAnimation = { cancel: vi.fn(), finish: vi.fn(), play: vi.fn(), pause: vi.fn(), onfinish: null, currentTime: 0 }`. Manual trigger helper exposed so tests can simulate animation completion. Mirrors existing `matchMedia` polyfill pattern.
- **P3-C2 (medium) Accepted** — `stop()` removes DOM nodes from layer *before* calling `Animation.cancel()` on each tracked animation. Detaching first means no repaint happens between cancel's transform reset and node removal — no snap-back flash.
- **P3-C3 (high) Accepted** — `afterRenderEffect` not regular `effect`. DOM-touching signal reads use the after-render primitive; first `attachLayer(el)` is guaranteed to receive a committed, document-tree-attached node.
- **P3-C4 (low) Accepted** — `nextDelay = Math.min(1000 / r(t), window - t + 10)` caps stale-timer reach beyond spawn window. Defense in depth even with `stop()` clearing `spawnTimer`.
- **P3-C5 (medium) Accepted with explicit risk** — desktop DevTools trace only at PR time; iOS WKWebView layer-budget verification deferred to follow-up issue (filed at PR time). If post-merge iOS testing reveals jank, drop cap or switch to canvas-backed render in a follow-up PR. Documented as a known risk in PR description.
- **P3-C6 (low) Accepted** — cap semantics declared in `Engine internals`: in-flight (`animations.length`), not total-ever-spawned. Verification asserts in-flight only.
- **P3-C7 (low) Accepted** — add `restoreMocks: true` to `packages/client/vitest.config.ts` (under `test:` block). Prevents prototype-spy leakage across files.
- **P3-C8 (low) Accepted** — `.confetti-layer` rule kept verbatim including `overflow: hidden`. CSS section affirms; verification adds computed-style assertion.

## Critique resolution log — pass 2

- **P2-C1 (blocker) Accepted** — pending-start queue: `startConfetti` stores `pendingPattern`; `attachLayer` flushes. No silent failure.
- **P2-C2 (high) Accepted** — per-celebration DOM alloc, `will-change` inline-only on live particles, full removal on `stop()`. Base `.confetti-piece` rule deleted. With WAAPI, `Animation.onfinish` handles individual eviction; `stop()` cancels all and clears layer.
- **P2-C3 (medium) Moot under WAAPI** — no `tick` API exists in the new engine; start/tick exclusivity question vanishes. Tests advance `setTimeout` chain via `vi.useFakeTimers()` instead.
- **P2-C4 (medium) Accepted** — narrow seam via `window.__confettiRng`; engine default rng reads `(window as any).__confettiRng ?? Math.random`. Playwright sets only that hook.
- **P2-C5 (medium) Accepted** — replace 4 motion-variant consensus snapshots with 3 pattern-pinned shots; keep 4 reduced-motion variants. Net -1 snapshot.
- **P2-C6 (high) Accepted** — service teardown order: `engine.stop()` → `showOverlay.set(false)` → template unmounts. `detachLayer()` invoked from `viewChild` signal effect when ref goes undefined; also from LobbyPage `ngOnDestroy`. Engine's `stop()` cancels animations + removes children + nulls layer ref so post-stop writes are no-ops.
- **P2-C7 (medium) Accepted** — new unit test in `confetti-engine.test.ts`: construct engine with a real `document.createElement('div')` as layer, seeded rng, advance fake timers past first spawn, assert `layer.children.length > 0` and that `Element.prototype.animate` was called with a keyframe array whose final transform's y > viewport.h. Catches start-before-attach + non-spawn regressions without depending on screenshot harness.

## Critique resolution log — pass 1

- C1–C13 (see prior revision) — all accepted; original responses still valid except items keyed to rAF, which are superseded by WAAPI:
  - **C5 (vitest rAF config) — Moot under WAAPI.** No rAF in engine. `vi.useFakeTimers()` for the spawn chain is standard.
  - **C9 (AC-12 test fidelity) — Different fix under WAAPI.** Round-swap test asserts `engine.liveCount()` non-zero mid-celebration, then swap → assert engine null and `layer.children.length === 0`.
  - **C13 (no perf gate) — Lower risk under WAAPI.** Compositor-thread animation has negligible main-thread cost; manual DevTools trace still attached as PR evidence, but jank probability is far lower.

## Phases

### Phase 1 (only) — engine + service rewire + lobby template + screenshots

- **Scope (files):**
  - new `packages/client/src/app/core/confetti-engine.ts`
  - new `packages/client/src/app/core/confetti-engine.test.ts`
  - edit `packages/client/src/test-setup.ts` — add `Element.animate` polyfill (P3-C1) alongside existing `matchMedia` polyfill
  - edit `packages/client/vitest.config.ts` — set `test.restoreMocks: true` (P3-C7)
  - rewrite `packages/client/src/app/core/celebration.service.ts` (delete polar `ConfettiPiece` + spiral spawn + `confettiPieces` signal; add `attachLayer` / `detachLayer` / `pendingPattern`; wire engine).
  - update `packages/client/src/app/core/celebration.service.test.ts` (drop `confettiPieces()` assertions; add attachLayer-flushes-pendingPattern path).
  - update `packages/client/src/app/core/celebration-overlay-dom.test.ts` (drop CSS-keyframe assumptions; assert `.confetti-layer` exists).
  - update `packages/client/src/app/lobby/lobby.page.ts` (template: empty `#confettiLayer` div; styles: drop `@keyframes hnchdConfetti` + `.confetti-piece` base rule + reduced-motion `.confetti-piece` rule; wire `viewChild` effect to call `attachLayer` / `detachLayer`).
  - edit `packages/e2e/tests/_screenshots/reveal-transition.spec.ts` — **replace the 4 motion-variant consensus snapshots** with 3 pattern-pinned snapshots (`reveal-burst-center`, `reveal-burst-top`, `reveal-burst-sides`). **Keep the 4 reduced-motion variants untouched.** Net -1 snapshot. Each pattern-pinned shot uses `page.addInitScript` to set `(window as any).__confettiRng = makeSeededRng(N)`.

- **Exit bar:**
  - `pnpm --filter @hnch/client typecheck` + lint green
  - `pnpm --filter @hnch/client test` green (incl. new engine tests + updated DOM tests)
  - `pnpm --filter @hnch/e2e test --grep "@reveal"` green
  - Manual UI smoke: force ≥6 consensus reveals on a dev session — visually confirm all 3 patterns appear over the runs; gravity visible (particles accelerate downward, never spiral); `prefers-reduced-motion` (devtools emulate) suppresses; round-swap mid-celebration clears cleanly; hide tab mid-burst → particles freeze, resume on return.
  - DevTools Performance trace ≥ 1 s during burst attached to PR description (target: main-thread idle > 80% of frames — much easier to hit under WAAPI; long tasks < 50 ms).
  - Screenshots: lefthook pre-push publishes reveal snapshots to `screenshots` branch + sticky PR comment.

- **PR title scope:** `feat(client,e2e): rework consensus celebration with gravity-based emoji bursts`

- **Worktree:** `git fetch origin && pnpm worktree:add consensus-celebration-gravity-bursts main`

- **Depends on:** none

- **Pre-flight inside worktree:** `grep -nE "angle|distance|CONFETTI_EMOJIS|setInterval" packages/client/src/app/core/celebration.service.ts` to confirm `main` HEAD still matches plan's delete list. If diverged, re-read service and adjust before coding.

## Open questions

- **Mobile perf at 150** — WAAPI on iOS WKWebView is well-optimized; 150 simultaneous compositor animations should be fine. Verify via DevTools Performance trace on a low-end Android emulator during execution. If jank appears, drop cap to 120.
- **Tuning knobs** — `gravity ≈ 1800`, `peakRate ≈ 110/s`, `k = 1.0`, side-cannon `speed = 350 + rng²*700`, center `speed = 400 + rng²*900`. Iterate live.
- **Waypoint count** — 15 samples per trajectory is conservative; if visual stepping is visible try 25. Beware total keyframe count = `15 × 150 = 2250` keyframe objects allocated per celebration — that's fine but worth noting.

## Verification plan

- `pnpm --filter @hnch/client typecheck`, lint, test.
- New `confetti-engine.test.ts` (relies on `Element.animate` polyfill from test-setup.ts):
  - `computeTrajectory({x:0,y:0,vx:100,vy:-200,…}, gravity:1800, …)` returns keyframes whose final `y` is below the viewport floor (gravity acts; analytic check).
  - `start('center')` → after fake-timer advance past first spawn delay, `layer.children.length === 1`, `Element.prototype.animate` spy captured one call whose initial keyframe transform places the particle near `viewport.w/2, viewport.h*0.45`.
  - `start('top-sprinkle')` → spawned particle's initial transform places it at `y ≈ -20`.
  - `start('side-cannons')` → over ≥10 spawns, mix of left-edge (`x ≈ -20`) and right-edge (`x ≈ viewport.w + 20`) initial transforms.
  - Final keyframe `transform` of every captured animation has `y > viewport.h` (eviction by trajectory end, not race).
  - After ≥150 spawns, `liveCount()` never exceeds 150; engine drops further spawn requests.
  - `stop()` calls `cancel()` on every tracked `Animation` (spy on `Animation.prototype.cancel`); `layer.children.length === 0`; subsequent spawn-timer fires are no-ops.
  - **P2-C7 attached-layer guard:** the spawn-fires test above directly asserts `layer.children.length > 0` post-spawn → catches start-before-attach regressions without depending on screenshot harness.
  - Window-hook rng: when `(window as any).__confettiRng` is set before engine construction, pattern selection in `start()` matches the seeded sequence (deterministic).
- Updated `celebration.service.test.ts`:
  - All existing consensus()/skip/reload/round-swap assertions pass (no public API change to `consensus`/`showOverlay`).
  - `startConfetti()` without prior `attachLayer` stores `pendingPattern` and creates no engine; subsequent `attachLayer(el)` instantiates engine and starts.
  - AC-12 round-swap: mid-celebration, engine exists; swap round → engine is null and any live animations canceled.
- Updated `celebration-overlay-dom.test.ts`:
  - `.confetti-layer` exists when `showOverlay()` is true.
  - `.confetti-layer` computed `overflow` is `hidden` (P3-C8 guard against accidental CSS deletion).
  - No `<span class="confetti-piece">` rendered by template (engine owns children; not attached in JSDOM unit test).
- e2e (`reveal-transition.spec.ts`):
  - 3 pattern-pinned snapshots (replacing 4 motion variants); each via seeded `__confettiRng` hook.
  - Snapshots non-pixel-asserted (reviewer artifacts).
- Manual UI smoke (golden path): 6+ consensus reveals → all 3 patterns observed; reduced-motion suppresses; round-swap clears; tab-hide pauses + resumes.
- DevTools Performance trace attached to PR description.

## Screenshots

**Required:** Yes

- Screens: post-reveal Lobby mid-burst (~600 ms in). Three new pattern-pinned snapshots (`reveal-burst-center` / `-top` / `-sides`), replacing the 4 prior motion variants. Reduced-motion variants kept.
- Variants: default theme; default mobile viewport (existing harness).
- Path: `docs/screenshots/<sha>/reveal/` — lefthook pre-push hook publishes when `@reveal` tag matches.
- Delivery: published to `screenshots` branch under `sha-<short>/`; sticky PR comment updated.
- Pattern pinning: `await page.addInitScript((seed) => { let s = seed; (window as any).__confettiRng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000; }, N);` with different `N` per snapshot. Engine's default rng reads `__confettiRng` if present, falls back to `Math.random` otherwise — **production never touches the hook**; Ionic/Angular `Math.random` consumers untouched.
- Frame jitter accepted: WAAPI animations run on compositor with consistent timing, but per-particle randomness still depends on the seeded sequence — snapshots are reviewer artifacts, not pixel-asserted.

## Screenshot tags

`@reveal`

Rationale: change scoped entirely to the consensus celebration overlay, exercised only by `@reveal`-tagged scenes.

## References

- Issue: https://github.com/IIxauII/hnch/issues/303
- Spec: [docs/specs/consensus-celebration-gravity-bursts.md](../specs/consensus-celebration-gravity-bursts.md)
- Adjacent prior specs: `docs/specs/consensus-celebration-hnchd.md`, `docs/specs/celebration-overlay-fix.md`, `docs/specs/consensus-overlay-scope-to-component.md`
- ADR-0040 (skip race guard, untouched)
- ADR-0041 (consensus + abstain guard, untouched)
- ADR-0028 (no telemetry — no metrics added)
- ADR-0027 (test-only surfaces env-gated — informs why we use a Playwright-only `__confettiRng` hook rather than a client-side debug surface)
- Web Animations API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
