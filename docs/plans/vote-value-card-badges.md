# Vote value card-face badges in results

**Status:** Draft
**Date:** 2026-05-21
**Source spec:** docs/specs/vote-value-card-badges.md
**Source issue:** https://github.com/IIxauII/hnch/issues/286
**Shape:** Single PR

## Summary

Restyle the vote-value element inside each results group as a small rounded, bordered, elevated badge — echoing the Estimating card tile aesthetic at reduced size. Pure client-side CSS change in one file. Light + dark, mobile + portal covered via existing mode-aware tokens.

Visual anchor:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true (portal, dark — current)
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/16-lobby-results-390.png?raw=true (mobile, dark — current)

## Approach

Single file: `packages/client/src/app/shared/vote-results.component.ts` — styles block only.

Add badge styling to `.card` selector inside `.group-header`:
- `display: inline-flex; align-items: center; justify-content: center;`
- `min-width: 2rem; padding: 2px 8px;`
- `border-radius: 6px;`
- `border: 1.5px solid var(--hnch-sep-strong);`
- `background: var(--hnch-elev-2);`
- `box-shadow: var(--hnch-shadow-1);`
- `font-size: 1rem;` (down from `1.15rem`)
- `font-weight: 700;` (unchanged)

Update `.group-header` flex props:
- `align-items: center;` (down from `baseline`)

Override badge on non-card groups so meta-labels stay plain text:
```scss
.group.abstained .card,
.group.didnt-vote .card {
  border: none;
  background: none;
  box-shadow: none;
  padding: 0;
  border-radius: 0;
  min-width: unset;
}
```

`.group-header { min-width: 5.5rem }` kept — preserves chip-column alignment across rows.

`.group-header` flex alignment changes from `align-items: baseline` to `align-items: center`. Baseline-alignment of an inline-flex badge against the adjacent `(N votes)` count text resolves to the badge's bottom-margin edge in browsers, pushing the count below the badge centerline. Centering both children sidesteps the synthesized-baseline trap.

## ADR impact

None — pure UX/style change. No schema, sync, relay, or shared-package touch.

## Decisions resolved

1. **Left column width (`.group-header min-width`)** — keep `5.5rem`. Rationale: no layout shift on chip column start; user picked stability over compaction.
2. **Box-shadow on badge** — include `var(--hnch-shadow-1)`. Rationale: matches Estimating card aesthetic; token is mode-aware (subtle in dark, carries elevation in light).
3. **Badge font-size** — `1rem` (down from `1.15rem`). Rationale: fits the badge frame as a "mini card" rather than overflowing.
4. **Screenshot tag scope** — `@reveal|@baseline|@layout`. Rationale: `@reveal` covers reveal-frame mobile+portal/light+dark via `vote-bars-shot.spec.ts`; `@baseline` keeps the cited `baseline/16-lobby-results-390.png` mobile anchor fresh (it's tagged `@home|@baseline`, not `@reveal`); `@layout` catches the multi-column grid scenes that compose around the badge.
5. **`.group-header` flex alignment** — switch from `align-items: baseline` to `align-items: center`. Rationale: inline-flex badge synthesizes baseline at bottom-margin edge; centering avoids the count text sitting below the badge centerline.

## Phases

### Phase 1 — Restyle vote-value badge

- **Scope:** `packages/client/src/app/shared/vote-results.component.ts` (styles block only)
- **Exit bar:** Badge renders on mobile + portal, light + dark; abstained / didn't-vote headers remain plain text; no regression on stats row, chips, or other lobby sections.
- **PR title scope:** `feat(client): style revealed vote values as card-face badges`
- **Worktree:** `pnpm worktree:add vote-value-card-badges main --plan vote-value-card-badges` at execution time
- **Depends on:** none

## Open questions

None.

## Verification plan

- `pnpm --filter @hnch/client typecheck`
- `pnpm --filter @hnch/client lint`
- `pnpm --filter @hnch/client build`
- Manual: spin up `pnpm dev:client` + `pnpm dev:relay`, create a session, cast votes, reveal — verify badge appearance in both themes at mobile + portal viewport. Verify abstain + didn't-vote rows stay plain.
- Pre-push: `lefthook` runs `@reveal`-tagged screenshot subset; resulting PNGs surface on the PR comment for review.
- No new unit/e2e tests required — change is style-only and visually verified.

## Screenshots

**Required:** Yes

- Screens: post-reveal lobby (results section)
- Variants: light + dark; mobile (390 px) + portal (≥1280 px)
- Path: handled by existing screenshot harness — `@reveal`-tagged specs cover `reveal/*` scenes
- Delivery: pre-push hook publishes to `screenshots` branch under `sha-<short>/`, sticky PR comment with `blob/...?raw=true` embeds (per CLAUDE.md → Screenshots)
- Merge handling: no manual screenshot commit — harness automation only

## References

- Spec: docs/specs/vote-value-card-badges.md
- Issue: https://github.com/IIxauII/hnch/issues/286
- Related (shipped): #197 vote-results multi-column grid — composes inside each grid cell
- File: packages/client/src/app/shared/vote-results.component.ts:244-253 (current `.group-header` / `.card` styles)
- Tokens: packages/client/src/theme/variables.scss (`--hnch-elev-2`, `--hnch-sep-strong`, `--hnch-shadow-1`)

## Screenshot tags

`@reveal|@baseline|@layout`

Rationale: `@reveal` covers reveal-frame mobile + portal in light + dark via `vote-bars-shot.spec.ts`; `@baseline` keeps the cited `baseline/16-lobby-results-390.png` mobile anchor fresh (tagged `@home|@baseline`, not `@reveal`); `@layout` catches multi-column grid scenes composing around the badge.

## Critique rejected

- **C3 (round-history blast radius)** — verified isolated. `RoundHistoryComponent` does NOT use `VoteResultsComponent`; see `packages/client/src/app/shared/round-history.component.ts:28` ("all rounds except the most recent, which VoteResultsComponent covers in full"). No tag widening or AC addition needed.
