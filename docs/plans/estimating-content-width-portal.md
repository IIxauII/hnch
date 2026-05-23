# Estimating content width parity with Lobby (portal)

**Status:** Draft
**Date:** 2026-05-22
**Source spec:** [docs/specs/estimating-content-width-portal.md](../specs/estimating-content-width-portal.md)
**Shape:** Single PR

## Summary

Widen Estimating's portal content column from 640 px to 800 px to match Lobby. Eliminates the 160 px column-width jump that repeats on every Lobby ↔ Estimating round cycle on portal viewports (≥768 px). Mobile unaffected.

## Approach

One-line change to the `@include page-container(…)` argument at `packages/client/src/app/estimating/estimating.page.ts:234`: `640px` → `800px`. The `page-container` mixin (`packages/client/src/theme/_page-container.scss`) gates on `@media (min-width: $bp-md)`, so mobile remains full-width. The Estimating card grid uses `repeat(auto-fill, minmax(120px, 1fr))` and auto-adapts column count: Fibonacci flows from ~5 to ~6 cards/row; T-shirt and Powers-of-2 fit comfortably. Lobby (`packages/client/src/app/lobby/lobby.page.ts:562`) already uses `page-container(800px)` — no change there.

Visual anchors:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/06-lobby-1440.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/13-estimating-1440.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/layout/estimating-1440-light.png?raw=true

## ADR impact

- None. Pure client styling. No schema, sync protocol, identity, host election, or access surface touched.

## Decisions resolved

1. **PR shape:** Single PR — one-line SCSS mixin arg flip in one file; phasing would be overkill.
2. **Screenshots required:** Yes — visible layout change on portal; need before/after evidence at 1440 px in both themes plus 390 px mobile no-regression.
3. **Screenshot tag scope:** `@layout` — existing tag already exercises Estimating at 1440 px light + dark and 390 px light + dark, exactly the surface that changes.
4. **Commit type:** `fix(client)` — resolves a UX-level discrepancy (distracting column shift), not a stylistic preference.

## Phases

### Phase 1 — Widen Estimating portal column

- **Scope:** `packages/client/src/app/estimating/estimating.page.ts` — change line 234 `@include page-container(640px)` → `@include page-container(800px)`. No template, no other styles, no logic changes.
- **Exit bar:**
  - Estimating at 1440 px renders content column at 800 px, horizontally aligned with Lobby.
  - Lobby ↔ Estimating navigation on portal shows no visible width or position shift.
  - Card grid (Fibonacci, T-shirt, Powers-of-2) renders without horizontal overflow at 800 px.
  - "Abstain this round" button still spans full column width.
  - Mobile (≤430 px) renders identically to current.
  - Light + dark themes show no change other than the widened column.
  - `pnpm --filter client typecheck`, `lint`, `test`, `build` all green.
- **PR title:** `fix(client): widen Estimating portal column to match Lobby (#296)`.
- **Worktree:** run `git fetch origin` first, then `pnpm worktree:add estimating-content-width-portal main` at execution time.
- **Depends on:** none.

## Open questions

- Tablet range (768–1279 px) at the new 800 px cap is a side effect, not a regression — verify during screenshot pass that 768 px viewport does not visibly degrade.

## Verification plan

- `pnpm --filter client typecheck`
- `pnpm --filter client lint`
- `pnpm --filter client test`
- `pnpm --filter client build`
- Manual smoke (`pnpm dev:client`): open at 1440 px, create room, Start Round → Reveal → Start Round; observe no column shift. Repeat in dark theme.
- Screenshot hook on `git push` runs the `@layout`-tagged subset and updates the sticky PR comment.

## Screenshots

**Required:** Yes

- Screens: Estimating page (primary); Lobby implicitly covered via `@layout` for parity comparison.
- Variants: 1440 px light, 1440 px dark; 390 px light + dark for mobile no-regression proof.
- Delivery: lefthook pre-push hook publishes PNGs to the `screenshots` branch under `sha-<short>/` and updates the sticky PR comment with `<!-- hnch-screenshots -->` marker. No manual screenshot commit on the PR branch.
- Merge handling: none — hook-driven flow does not touch PR commits.

## References

- Spec: [docs/specs/estimating-content-width-portal.md](../specs/estimating-content-width-portal.md)
- Issue: https://github.com/IIxauII/hnch/issues/296
- Related: #180 (card grid orphan rows — design fix for 800 px), #272 (footer CTA full-width portal — target 800 px after this lands)
- Mixin: `packages/client/src/theme/_page-container.scss`
- Call sites: `packages/client/src/app/estimating/estimating.page.ts:234`, `packages/client/src/app/lobby/lobby.page.ts:562`

## Screenshot tags

`@layout`

Rationale: change is a portal column-width adjustment on Estimating; the `@layout` tag already exercises Estimating at 1440 px light + dark and 390 px light + dark — exactly the surface that changes and the mobile baseline that must stay flat.
