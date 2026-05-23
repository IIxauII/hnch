# Voted dot initials use palette ink color

**Status:** Draft
**Date:** 2026-05-22
**Source spec:** [docs/specs/voted-dot-ink-color.md](../specs/voted-dot-ink-color.md) · [#295](https://github.com/IIxauII/hnch/issues/295)
**Shape:** Single PR

## Summary

`AvatarVoteRowComponent` hardcodes the voted-dot initial letter to white, which fails contrast on five light-toned palette colors (dijon, orange, amber, green, teal). Add a `resolveAvatarInkColor` helper to `packages/shared/src/avatar-palette.ts` that reads the existing `AccentDef.ink` field, then bind the component's `.dot-initial` color from it. Same-PR change across `shared` + `client`.

## Approach

Visual anchor:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating/estimating-pre-vote.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating/estimating-post-vote.png?raw=true

1. **shared**: add `resolveAvatarInkColor(value: string | undefined, deviceId: string): '#000' | '#fff'` next to `resolveAvatarColor` in `packages/shared/src/avatar-palette.ts`.
   - If `value` is an `AccentKey` → `ACCENTS[value].ink` (declared).
   - If `value` matches `HEX_RE` (raw `#rrggbb`) → compute WCAG relative luminance of that exact hex; return `'#000'` when `L > 0.179`, else `'#fff'`. Ink derives from the actual rendered background color, not a palette fallback.
   - If `value` is missing/invalid → resolve via `deterministicAvatarColor(deviceId)` and return that palette entry's `ink` (mirrors `resolveAvatarColor`'s missing-value fallback).
2. **shared**: unit test in `avatar-palette.test.ts` covering: each `AccentKey` returns its declared `ink`; light custom hex (`#FFFF00`, `#FFD60A`) → `'#000'`; dark custom hex (`#111111`, `#0B3D2E`) → `'#fff'`; missing value yields deterministic-key ink.
3. **client**: in `packages/client/src/app/estimating/avatar-vote-row.component.ts`, import the helper, add `protected inkOf(p)` method, bind `[style.color]="inkOf(p)"` on the `.dot-initial` span, remove the `.dot.voted .dot-initial { color: #fff }` SCSS rule.
4. **client**: verify the unvoted-state `.dot-initial` rule (`color: var(--ion-color-medium)`) is untouched.

No schema change, no relay, no migration.

## ADR impact

- **ADR-0043 (accent system):** conforms. The `ink` field exists for exactly this purpose; we adopt it where it was previously ignored. No new or superseding ADR required.

## Decisions resolved

1. **Helper location.** Same file `avatar-palette.ts` (vs new `avatar-ink.ts`). Co-located with `ACCENTS` + `resolveAvatarColor`; mirrors existing pattern, no barrel churn.
2. **Custom-hex fallback algorithm.** WCAG relative luminance of the actual hex, threshold `0.179` for the black/white crossover (vs palette-delegate fallback, vs always-white). Custom-color UI can emit raw `#rrggbb`, so ink must derive from the rendered bg color itself — anything else risks mismatched contrast. Palette keys still use their declared `ink`; only the non-key hex path computes luminance.
3. **PR shape.** Single PR with scope `feat(client,shared)`. ~3 file edits + 1 test; multi-PR split would add overhead with no isolation benefit.
4. **Screenshots required.** Yes — estimating post-vote state with mixed palette so reviewers can see the contrast change directly.

## Phases

### Phase 1 — Helper + adoption (single PR)

- **Scope:** `packages/shared/src/avatar-palette.ts`, `packages/shared/src/avatar-palette.test.ts`, `packages/client/src/app/estimating/avatar-vote-row.component.ts` (and its `.scss` if styles are inline-imported)
- **Exit bar:** All 8 spec ACs pass as written; shared + client typecheck + lint + unit tests green; screenshots posted on PR comment with branch-file links.
- **PR title scope:** `feat(client,shared): voted dot initials adopt palette ink color`
- **Worktree:** run `git fetch origin && pnpm worktree:add voted-dot-ink-color main` at execution time
- **Depends on:** none

## Open questions

- Does the `.dot.voted .dot-initial` SCSS rule live inline in the component's `styles:` array or in a sibling `.scss` file? Confirm at execution; either way the deletion is one line.

## Verification plan

- `pnpm --filter @hnch/shared typecheck && pnpm --filter @hnch/shared test` — covers new helper unit test.
- `pnpm --filter @hnch/client typecheck && pnpm --filter @hnch/client lint && pnpm --filter @hnch/client build` — covers component edit.
- Manual UX check: open Estimating with two seeded participants whose avatars are set to `amber` and `graphite`; cast votes; confirm amber dot shows black initial and graphite dot shows white initial. Repeat in dark theme.
- Screenshot harness: pre-push hook will capture `@reveal` / `@participants`-tagged scenes; review diffs.

## Screenshots

**Required:** Yes

- Screens: Estimating mid-round with voted + unvoted dots; mixed-palette participants covering at least one light accent (amber or teal) + one dark accent (graphite or racing-green).
- Variants: light + dark theme, portal width (mobile width covered by the harness baseline).
- Path: `docs/screenshots/voted-dot-ink-color/`
- Delivery: PR comment with branch-file links (`https://github.com/IIxauII/hnch/blob/<branch>/docs/screenshots/voted-dot-ink-color/<file>.png`). Sticky harness comment will handle the canonical `@reveal`/`@participants` diffs automatically.
- Merge handling: squash the manual-screenshot commit before merge; harness PNGs land in `docs/screenshots/<sha>/` on `main` via the post-merge workflow.

## Screenshot tags

`@participants|@reveal`

Rationale: change affects the voted-dot rendering inside `AvatarVoteRowComponent`, which appears in participant lists during estimating and in reveal states. Tag scope keeps the harness focused on the surfaces this PR touches.

## References

- Spec: [docs/specs/voted-dot-ink-color.md](../specs/voted-dot-ink-color.md)
- Issue: https://github.com/IIxauII/hnch/issues/295
- Palette source: `packages/shared/src/avatar-palette.ts` (`ACCENTS`, `AccentDef.ink`, `deterministicAvatarColor`, `resolveAvatarColor`)
- Consuming component: `packages/client/src/app/estimating/avatar-vote-row.component.ts`
- ADR-0043 (accent system)
