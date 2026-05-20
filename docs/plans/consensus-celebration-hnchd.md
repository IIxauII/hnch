# Plan: Consensus celebration — "hnch'd!" + confetti

**Status:** Draft
**Date:** 2026-05-20
**Source spec:** `docs/specs/consensus-celebration-hnchd.md`
**Shape:** Single PR — `feat(client,e2e,repo): celebration overlay with confetti on unanimous consensus`

## Summary

Replace the static "Consensus!" overlay badge with a celebration moment: badge text becomes "hnch'd!", party emoji confetti continuously emits over the 3-second auto-dismiss window. Reduced-motion users see a static badge with a single inline 🎉. Pure client-side CSS animation, no new dependencies, no ADR touch.

## Approach

Scope: `packages/client/src/app/shared/vote-results.component.ts`. Add a confetti layer inside the existing consensus overlay `@if`. Pieces are `<span>` nodes carrying per-piece CSS custom properties (`--angle`, `--distance`, `--rotate`, `--duration`, `--delay`) driven by a single keyframe that does radial translate + ballistic fall + rotate + opacity. Continuous spawn at ~10 pieces/s for 3 s via a setInterval gated on `showOverlay`; teardown clears the interval and the piece list.

Emoji set: `🎉 🎊 🥳 🪩 ✨ 🎈 🌟` (uniform random pick per piece).

Z-order: confetti behind badge (`z-index` layering inside overlay).

Reduced-motion (`@media (prefers-reduced-motion: reduce)`): suppress confetti spawn (TS-side check via `window.matchMedia` before scheduling the interval), suppress badge scale-in + pulse (existing CSS pattern at `vote-results.component.ts:339` already covers `.consensus-text` — extend to confetti layer with `display: none`). Inject single inline 🎉 next to "hnch'd!" text in this mode.

Doc update: `docs/ux.md` §2.2 "Reveal animation" extended with badge/overlay/celebration spec.

E2e: two screenshot scenes under `@reveal` — one motion (snapshot at t=500ms, flake risk accepted), one reduced-motion (`page.emulateMedia({ reducedMotion: 'reduce' })`). Both full-screen.

Visual baseline: `docs/screenshots/latest/` symlink not present locally; harness will regenerate post-merge.

## ADR impact

- ADR-0018 (unanimous auto-reveal) — no change; this plan only touches the visual treatment of the moment ADR-0018 already specifies.
- ADR-0002 (stack) — no touch; CSS-only, no new dep.
- ADR-0028 (no telemetry) — honored; success criteria stay behavioral.

## Decisions resolved

1. **D1 — Confetti impl:** CSS keyframes + DOM `<span>` emoji. Rationale: zero new deps, native emoji glyph rendering, perf-fine at peak ~30 elements, theming-clean.
2. **D2 — Emoji set:** `🎉 🎊 🥳 🪩 ✨ 🎈 🌟`, uniform pick. Rationale: variety without 🎆/🎇 rendering-variance risk on older Android.
3. **D3 — Density:** Continuous spawn at ~10/s for 3 s (peak ~30 simultaneous elements). Rationale: alive feel; perf budget acceptable.
4. **D4 — Motion path:** Radial burst from badge center + ballistic gravity-fall + 0–360° rotation per piece. Rationale: matches "confetti style" framing in spec.
5. **D5 — Z-order:** Emoji behind badge. Rationale: badge text always legible.
6. **D6 — Badge motion:** Keep existing scale-in + 3× pulse unchanged. Rationale: confetti carries energy; badge stays readable.
7. **D7 — Reduced-motion content:** Static badge + single inline 🎉 next to text. Rationale: middle-ground celebration cue motion-free users still get.
8. **D8 — Test strategy:** Both motion + reduced-motion full-screen snapshots, no masking. Rationale: user choice — see D11 for known flake risk.
9. **D9 — PR shape:** Single PR. Rationale: one component, one package; cohesive review.
10. **D10 — ADR:** None. Rationale: pure UX, no structural touch, no new dep.
11. **D11 — Motion snapshot determinism:** Snapshot at t=500ms with accepted flake risk. Rationale: user accepts non-determinism rather than adding test-only seed plumbing. Plan flags this so reviewers don't push back.
12. **ux.md:** Update §2.2 in same PR. Rationale: doc + code ship together.

## Additional acceptance criteria (from critique)

- **AC-11 (a11y):** `.confetti-layer` carries `aria-hidden="true"`. Screen readers announce the badge text ("hnch'd!") once via the existing `.consensus-text` element; no emoji glyphs are announced.
- **AC-12 (interval lifecycle):** The confetti spawn interval is stored on a class field and cleared in **all** of: (a) the round-change effect that resets `showOverlay`, (b) the overlay-dismiss path (tap + 3 s auto-dismiss), (c) `destroyRef.onDestroy`. No orphan interval may survive any teardown path (covers HMR re-mount + Angular signal-effect re-runs).
- **AC-13 (skip race, ADR-0040):** A round that is both unanimous and `skippedAt` resolves via `terminalState()` to skip-wins; no celebration overlay, no confetti, no badge renders for that round. Add an e2e or unit assertion exercising the (skip-then-everyone-votes-same) ordering.
- **AC-14 (viewer role, ADR-0020):** A viewer-role participant in an otherwise unanimous round observes the overlay + confetti identically to voters (the celebration is round-state-driven, not local-role-gated). Cover with a unit or e2e check.

## Additional scope cuts (Out — from critique)

- **Reduced-motion mid-flight toggle.** If the user toggles OS `prefers-reduced-motion` during the 3 s overlay window, CSS animations re-evaluate live but the TS-side spawn interval keeps emitting; existing pieces fade out naturally as their keyframes complete, but new pieces may briefly spawn before the next CSS re-evaluation suppresses them. Rare edge — not in scope; not worth the matchMedia listener plumbing.
- **CLI parity for the rename.** `packages/cli` consensus rendering is not updated in this PR — confetti is graphical, CLI terminal cannot render it, and the badge-text rename in CLI is deferred (separate follow-up issue if any).

## Phases

### Phase 1 (only phase) — Celebration overlay redesign

- **Scope:**
  - `packages/client/src/app/shared/vote-results.component.ts` — template (`@if` block adds `.confetti-layer` with `@for piece of confettiPieces()`), styles (new `.confetti-piece` + `@keyframes hnchdConfetti`, reduced-motion guard), TS (signal `confettiPieces`, spawn interval inside reveal effect, teardown via existing `destroyRef.onDestroy` + round-change reset, badge text rename), constructor `addIcons` unchanged.
  - `docs/ux.md` §2.2 — extend "Reveal animation" with badge text, overlay scrim, 3 s window, dismiss behavior, confetti, reduced-motion fallback.
  - `packages/e2e/tests/_screenshots/reveal-transition.spec.ts` — extend or add new scenes under `@reveal`: (a) motion variant capturing overlay at t=500ms, (b) reduced-motion variant via `page.emulateMedia({ reducedMotion: 'reduce' })`.
- **Exit bar:**
  - All ACs pass (AC-1..AC-14 from spec + this plan).
  - `pnpm -F @hnch/client lint typecheck build` clean.
  - `pnpm -F @hnch/client test` clean.
  - `pnpm -F @hnch/e2e test --grep @reveal` clean (motion scene may need 1–2 retries; flake risk accepted).
  - `docs/ux.md` §2.2 reflects new behavior.
  - Scope coverage check: `git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u` matches the `feat(client,e2e,repo)` PR title scope; no missed package.
- **PR title scope:** `feat(client,e2e,repo): hnch'd celebration overlay with confetti`
- **Worktree:** `git fetch origin && pnpm worktree:add consensus-celebration main` at execution start.
- **Depends on:** none.

## Open questions

- Peak DOM-node budget on low-end mobile — fixed at ~30 simultaneous; if perf review flags it, reduce spawn rate from 10/s to 7/s.
- Visual baseline screenshots (`docs/screenshots/latest/`) absent locally — confirm `screenshots-main` workflow regenerates after merge.

## Verification plan

| Step | Command | Package |
|---|---|---|
| Typecheck | `pnpm -F @hnch/client typecheck` | client |
| Lint | `pnpm -F @hnch/client lint` | client |
| Unit | `pnpm -F @hnch/client test` | client |
| Build | `pnpm -F @hnch/client build` | client |
| E2e (scoped) | `pnpm -F @hnch/e2e test --grep @reveal` | e2e |
| Manual mobile smoke | `pnpm dev:client` → trigger unanimous consensus → verify "hnch'd!" + confetti at 375 px width and 1440 px | client |
| Reduced-motion smoke | Chrome DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` → verify static badge + inline 🎉, no confetti | client |
| Theme smoke | Toggle light/dark → verify legibility both modes | client |

## Screenshots

**Required:** Yes — UI visible change at high-attention moment.

- **Screens:** Consensus reveal overlay (full-screen).
- **Variants:**
  - Motion: light + dark, mobile + portal — 4 PNGs at t=500ms (flake risk accepted per D11).
  - Reduced-motion: light + dark, mobile + portal — 4 PNGs (deterministic, no animation).
- **Path:** Generated by `pnpm screenshots:publish` pre-push hook; published to `screenshots` branch under `sha-<short>/`.
- **Delivery:** Sticky PR comment via existing harness (marker `<!-- hnch-screenshots -->`), `blob/...?raw=true` embeds.
- **Merge handling:** Standard — no manual squash; harness commits live on `screenshots` branch, not on the feature branch.
- **Tag scope:** `.screenshot-tags` written with `@reveal` (already created by `/spec` step).

## Critique log

Single pass via `plan-critic` on 2026-05-20.

**Accepted (6):**
- C1 → AC-12 (interval cleanup across all teardown paths; folds C9 HMR concern).
- C2 → AC-13 (skip+unanimous race resolves to skip-wins, no celebration).
- C4 → exit-bar adds `git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u` scope check.
- C7 → AC-11 (`aria-hidden` on confetti layer; SR announces badge once).
- C8 → moved to Out (RM mid-flight toggle is rare-edge, not in scope).
- C12 → AC-14 (viewer-role overlay observability).

**Rejected (5):**
- C3 (CLI parity): Rejected — confetti is graphical; CLI rename deferred to follow-up issue if any.
- C5 (flake retry budget): Rejected — D11 already accepts flake risk; no extra infra now.
- C6 (new scene file): Rejected — extend `reveal-transition.spec.ts` as planned.
- C10 (drop 🪩 for dark contrast): Rejected — keep full emoji set; dark+motion PR screenshot serves as visual gate.
- C11 (measurable AC metrics): Rejected — visual ACs stay narrative; screenshot review resolves.

## References

- Spec: `docs/specs/consensus-celebration-hnchd.md`
- Issue: https://github.com/IIxauII/hnch/issues/274
- ADR-0018: unanimous auto-reveal
- Component: `packages/client/src/app/shared/vote-results.component.ts`
- UX doc: `docs/ux.md` §2.2 (target of update)
- Existing reduced-motion patterns: `estimating.page.ts:290,298`, `vote-results.component.ts:283,339`
- Existing reveal screenshot scenes: `packages/e2e/tests/_screenshots/reveal-transition.spec.ts:85–154`, `vote-bars-shot.spec.ts:137–155`
