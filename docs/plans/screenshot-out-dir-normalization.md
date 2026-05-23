# Screenshot OUT_DIR normalization

**Status:** Draft
**Date:** 2026-05-20
**Source spec:** `docs/specs/screenshot-out-dir-normalization.md`
**Source issue:** https://github.com/IIxauII/hnch/issues/280
**Shape:** Single PR

## Summary

Centralize screenshot output-dir resolution behind one helper. Migrate all 16 specs under `packages/e2e/tests/_screenshots/` to per-feature subfolders under `docs/screenshots/<sha>/<feature>/`, aligned to the Playwright tag taxonomy (extended where needed). Group publisher PR-comment embeds by feature. Pure tooling change — no UI, no ADR impact.

## Approach

**Single helper** at `packages/e2e/tests/_screenshots/_helpers/out-dir.ts`:

```ts
// Signature only — not implementation.
export function resolveOutDir(feature: string): string;
//   reads SCREENSHOT_SHA env (or 'local'), returns
//   <repo-root>/docs/screenshots/<sha>/<feature>/
//   mkdir -p side-effect.
```

Every spec replaces its hardcoded `OUT_DIR` constant with `const OUT_DIR = resolveOutDir('<feature>')`. Feature slug is the spec's primary `@tag` (taxonomy extended for `@agenda`, `@keyboard`, `@vote-bars`, `@vote-dots`, `@baseline`).

PNG filenames within a shared feature dir are prefixed with the spec basename (e.g. `participant-cap-01-lobby.png` vs `participants-01-roster.png`) to avoid collisions when two specs share a subfolder (`participants/`, `history/`).

Publisher (`scripts/screenshot-publish.mjs`) sticky PR-comment generator emits one section per feature subfolder, alphabetical by feature name, with the existing `blob/...?raw=true` embed pattern unchanged.

## ADR impact

None — pure tooling/layout change. Verified no ADR in `adr/` constrains `docs/screenshots/` directory shape. `CLAUDE.md` "PR screenshots" bullet references `docs/screenshots/latest/` as canonical visual reference — contract preserved (only nested one level deeper).

## Decisions resolved

1. **Helper API:** Explicit function arg — `resolveOutDir('viewer')`. Decouples slug from filename; clearest call site.
2. **Slug source:** Primary `@tag` of each spec.
3. **Tag-catalog gaps:** Extend tag catalog. Add `@agenda`, `@keyboard`, `@vote-bars`, `@vote-dots`, `@baseline`. Update `packages/e2e/README.md → Tag catalog` in the same PR.
4. **Rename existing nested slugs:** Yes — rename `kbd/` → `keyboard/`, `vote-dots/` → `vote-dots/` (slug matches new tag), `agenda/` stays. Old `sha-*` dirs on the screenshots branch remain immutable; only new captures use new layout.
5. **Filename collisions:** Prefix each PNG with spec basename when multiple specs share one feature subfolder.
6. **`room-history.spec.ts`:** Move under sha as `history/` (shared with `round-history.spec.ts`); remove `docs/screenshots/local-room-history/`. Filenames prefixed `room-history-*` and `round-history-*`.
7. **PR shape:** Single PR — atomic cutover. Scope: `chore(e2e,repo)`.
8. **Screenshots needed for this PR:** No — pure tooling. Reviewers should not request UI screenshots.

## Spec → feature slug mapping

| Spec | Primary tag | Output subfolder |
|---|---|---|
| `agenda-states.spec.ts` | `@agenda` (new) | `agenda/` |
| `avatar-color.spec.ts` | `@theming` | `theming/` |
| `capture.spec.ts` | `@baseline` (new) | `baseline/` |
| `connection-states.spec.ts` | `@connection` | `connection/` |
| `estimating-shot.spec.ts` | `@layout` | `layout/` |
| `keyboard-shortcuts.spec.ts` | `@keyboard` (new) | `keyboard/` |
| `participant-cap.spec.ts` | `@participants` | `participants/` |
| `participants.spec.ts` | `@participants` | `participants/` |
| `password-flow.spec.ts` | `@password` | `password/` |
| `reveal-transition.spec.ts` | `@reveal` | `reveal/` |
| `room-history.spec.ts` | `@history` | `history/` |
| `round-history.spec.ts` | `@history` | `history/` |
| `session-ended.spec.ts` | `@session-end` | `session-end/` |
| `skip-round.spec.ts` | `@skip` | `skip/` |
| `vote-bars-shot.spec.ts` | `@vote-bars` (new) | `vote-bars/` |
| `vote-dots-196.spec.ts` | `@vote-dots` (new) | `vote-dots/` |

## Phases

Single PR — no phase split.

### Phase 1 — full migration

- **Scope:**
  - `packages/e2e/tests/_screenshots/_helpers/out-dir.ts` (new helper)
  - All 16 specs under `packages/e2e/tests/_screenshots/*.spec.ts` (OUT_DIR replacement + per-spec PNG prefix where shared)
  - `packages/e2e/README.md` (extend tag catalog **+ rewrite OUT_DIR example to use `resolveOutDir(...)` + refresh Scene index column to reference new subfolder paths**)
  - **Delete `packages/e2e/tests/_screenshot-host-actions.spec.ts`** — one-off from PR #255 with hardcoded absolute worktree path; never runs in CI, supplanted by `_screenshots/` tour.
  - `scripts/screenshot-publish.mjs` (PR-comment grouping by feature subfolder; verify tar-pipe handles nested dirs)
  - `CONTRIBUTING.md` → Screenshots section (document convention + helper usage)
  - `CLAUDE.md` → PR screenshots bullet (note nested-by-feature layout)
  - Delete `docs/screenshots/local-room-history/` (current files supplanted by next `main` refresh under `history/`)
- **Exit bar:**
  - `pnpm worktree:bootstrap` + local screenshot run produces all PNGs under `docs/screenshots/<sha or 'local'>/<feature>/`.
  - `find docs/screenshots/<sha> -maxdepth 1 -type f` returns empty.
  - PR sticky comment shows feature-grouped headings.
  - All `verify` matrix + `e2e` jobs green.
- **PR title scope:** `chore(e2e,repo): normalize screenshot OUT_DIR to per-feature subfolders (#280)`
- **Worktree:** `pnpm worktree:add screenshot-out-dir main` at execution time (after `git fetch origin`).
- **Depends on:** none.

## Critique resolutions

Devil's-advocate pass (plan-critic agent) raised 9 challenges. Resolutions:

- **C1 (claimed inventory blocker):** Discarded — critic read stale working tree despite warning. `origin/main` verified: all 16 specs already write under `docs/screenshots/<sha>/...`.
- **C2 (slug abstraction):** Original plan kept (tag-aligned + 5 new tags). User decision.
- **C3 (conditional prefix rule):** Original plan kept. Risk acknowledged; review-time discipline.
- **C4 (PR split):** Original plan kept — single PR. User decision. Mitigation: `lefthook` hook silently swallows publisher errors, so failure surface is limited; rollback path is `git revert` the single PR.
- **C5:** Applied — README OUT_DIR example + Scene index added to Phase 1 scope.
- **C6:** Applied — `_screenshot-host-actions.spec.ts` (PR #255 cruft) deletion added to Phase 1 scope.
- **C7:** Applied — `grep -r 'local-room-history'` exit-bar added.
- **C8:** Applied — testMatch verification + no-side-effect-at-import requirement added.
- **C9 (`@baseline` vs `@all`):** Document distinction in tag catalog: `@all` = "include in every grep narrowing"; `@baseline` = "the home/lobby/estimating tour scene set". Add to `packages/e2e/README.md` tag-catalog row description.

## Open questions

- Lint/test guard that fails CI when a spec adds a `page.screenshot({ path })` outside the helper — defer. Mention in CONTRIBUTING.md as a "future enhancement" rather than blocking this PR.
- Should `docs/screenshots/latest` symlink target change? No — it still points at the newest `sha-*` dir, contents just shift to nested.
- Will the `screenshots-main.yml` workflow need adjustment? Per spec: no — it consumes whatever `docs/screenshots/sha-*` produces and updates `latest` symlink; nested PNGs ride along.

## Verification plan

Per phase (only one phase here):

- `pnpm --filter @hnch/e2e exec tsc --noEmit` — typecheck helper + specs.
- `pnpm lint` at repo root.
- `pnpm --filter @hnch/e2e exec playwright test _screenshots --project=chromium --workers=1` with `SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=sha-test` set — confirm every spec writes under `docs/screenshots/sha-test/<feature>/`.
- `find docs/screenshots/sha-test -maxdepth 1 -type f | wc -l` → expect `0`.
- `find docs/screenshots/sha-test -mindepth 2 -name '*.png' | wc -l` → expect `>= 50` (matches prior coverage).
- `grep -r 'local-room-history' packages/ scripts/ docs/` returns empty (C7 — confirms no stale path readers).
- `grep -l '\.claude/screens\|\.tmp-screens\|/local-room-history' packages/e2e/tests/_screenshots/*.spec.ts` returns empty.
- Helper at `_helpers/out-dir.ts`: confirm `playwright.config.ts` `testMatch` does not pick it up; `mkdir` side-effect must occur only inside `resolveOutDir()`, never at module import (C8).
- Manual: open `scripts/screenshot-publish.mjs` dry-run mode (if any) or stage commit and inspect generated comment markdown for feature grouping.
- Push to PR branch → confirm CI sticky comment renders grouped sections; click two embeds to confirm `blob/...?raw=true` still resolves.

## Screenshots

**Required:** No — pure tooling/layout change with zero user-visible behavior shift. No `.screenshot-tags` file written; pre-push hook will run full suite (correct for a screenshot-infra change — full re-capture validates the new layout end-to-end).

## References

- Spec: `docs/specs/screenshot-out-dir-normalization.md`
- Issue: https://github.com/IIxauII/hnch/issues/280
- Related spec: `docs/specs/e2e-screenshot-coverage-expansion.md`
- Publisher: `scripts/screenshot-publish.mjs`
- Tag catalog source: `packages/e2e/README.md`
- Migration precedent: PR #278 (`1ae3a64`) migrated `avatar-color.spec.ts` off `.claude/screens/` — same pattern at smaller scale.
