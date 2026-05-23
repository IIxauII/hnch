# screenshot-publish.mjs: remote sha-dir false-positive skip

**Status:** Draft
**Date:** 2026-05-23
**Source spec:** docs/specs/screenshot-publish-remote-sha-check.md
**Shape:** Single PR

## Summary

Fix `remoteShaDirExists` in `scripts/screenshot-publish.mjs` so it correctly returns `false` when `sha-<sha>/` is absent from `origin/screenshots`. Today the helper only checks exit code on `git ls-tree`, which exits 0 with empty stdout on a missing pathspec — silently breaks both the pre-push skip check and the post-push verification, so PRs ship sticky comments with 404 image URLs.

## Approach

Replace the `git ls-tree`-based check with `git cat-file -e origin/<branch>:sha-<sha>`. `cat-file -e` exits non-zero when the object is absent — semantically the right primitive for "does this path exist on the remote-tracking ref" and trivially compatible with the existing `shOk` wrapper.

Freshness: `origin/<branch>` is a local remote-tracking ref, but the script already runs `git fetch origin ${SCREENSHOTS_BRANCH}` immediately before each call site (L178 pre-skip, L197 per retry, L532 post-push verify). After fetch, the ref mirrors remote tip and `cat-file -e` resolves the path against that just-fetched tree. No network call needed inside the helper itself.

Transitive effect: both call sites (`publishToScreenshotsBranch` skip path at L179, post-push verification at L533) currently call this same helper. Fixing the helper repairs both paths in one change — the spec's "post-push verification" success criterion is already coded; only its gating predicate is broken.

Also: the comment at L161 (`git ls-tree on a missing path exits 128 with stderr "not a valid object name"`) is factually wrong and motivated the bug. Replace with an accurate one-liner describing `cat-file -e` semantics.

Audit (already triaged from a read of the script):

- L160 `remoteShaDirExists` — broken (this fix).
- L214 `git diff --cached --quiet` — `--quiet` exits 1 when there is a diff, 0 when clean. Code treats `shOk` (no diff) as a bug condition and throws. Correct use.
- L500 `gh --version` — exit code is the only signal; correct use.

No other `shOk(...git ls-tree...)` / `shOk(...git cat-file...)` exit-0-on-absent shapes in the file. Findings get documented in the PR body for reviewer clarity; no further code changes.

## ADR impact

- None — pure tooling/script bug fix. No product behavior, sync protocol, schema, or ADR-recorded decision moves.

## Decisions resolved

1. **Check primitive — `git cat-file -e` vs `git ls-tree` stdout-non-empty.**
   - Chosen: `git cat-file -e origin/${SCREENSHOTS_BRANCH}:sha-${sha}`.
   - Why: semantically matches "object exists?", drops stdout parsing, stays a one-line `shOk` call. Same freshness as `ls-tree` (both read the local remote-tracking ref populated by the preceding `git fetch`).
2. **Regression test — add or skip.**
   - Chosen: skip; manual verify only.
   - Why: `scripts/` has no test harness; introducing one for a one-line fix is scope creep. Existing post-push verification at L532-537 already guards against the same failure mode once the helper is correct.
3. **Audit scope — this script vs all `scripts/**`.**
   - Chosen: this script only.
   - Why: read of the file showed only one false-positive shape; other `shOk` sites (`--quiet`, `gh --version`) are semantically correct. Broader sweep would generate noise without evidence of risk.
4. **PR shape — single PR with `fix(repo)` scope, no screenshots.**
   - Why: one file, tooling-only, no UX. Matches precedent in `ba5be39 fix(repo): refuse to update screenshots comment when push silently no-ops (#302)`.

## Phases

### Phase 1 — fix helper + comment

- **Scope:** `scripts/screenshot-publish.mjs` (function `remoteShaDirExists` and its leading comment).
- **Exit bar:**
  - `remoteShaDirExists(sha)` returns `false` when `sha-<sha>/` is absent on `origin/screenshots`, `true` when present.
  - Leading comment reflects `cat-file -e` semantics, not the prior incorrect `ls-tree` claim.
  - Both call sites (L179 skip, L533 post-push verify) exercise the corrected helper without further code change.
  - Manual verification confirms behavior on both branches of the predicate (see Verification plan).
- **PR title scope:** `fix(repo): screenshot-publish remote sha-dir check uses cat-file -e`
- **Worktree:** none — single-file fix, work directly on a feature branch off `main`.
- **Depends on:** none.

## Open questions

- None — `remoteShaDirExists` is the sole audited false-positive site and post-push verification already exists in the script.

## Verification plan

Per phase 1, after the edit:

1. `pnpm typecheck` (root) — script is `.mjs`, but workspace typecheck is the standard gate.
2. `node --check scripts/screenshot-publish.mjs` — syntactic sanity for the .mjs change.
3. Manual: on a feature branch with an open PR,
   - confirm `git ls-tree -r origin/screenshots | grep sha-<sha>` returns empty,
   - run `pnpm screenshots:publish`,
   - assert the script does NOT take the "skipping push, comment URLs valid" early-return; the publish flow runs and the sha-dir lands on `origin/screenshots`.
4. Manual idempotency: re-run `pnpm screenshots:publish` against the same sha after step 3 lands.
   - Assert the script now takes the skip path (`origin/screenshots already has sha-<sha>/`), no redundant push, no branch churn.
5. Manual post-push verification: temporarily delete `sha-<sha>/` from `origin/screenshots` (force-push from a scratch worktree) and re-run.
   - Assert the script either re-pushes (preferred) or fails loudly at L533 — never produces a sticky comment with broken links.

No new automated test added (see Decision 2).

## Screenshots

**Required:** No

- Reason: pure tooling fix in `scripts/`. No UI or visible product behavior moves.

## References

- Issue: https://github.com/IIxauII/hnch/issues/309
- Spec: docs/specs/screenshot-publish-remote-sha-check.md
- Precedent PR: ba5be39 `fix(repo): refuse to update screenshots comment when push silently no-ops (#302)`
- Related: CLAUDE.md → "PR screenshots" section
