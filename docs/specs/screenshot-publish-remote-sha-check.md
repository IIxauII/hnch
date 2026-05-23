# screenshot-publish.mjs: remote sha-dir false-positive skip

**Status:** Draft
**Date:** 2026-05-23
**Source:** https://github.com/IIxauII/hnch/issues/309

## Problem

`scripts/screenshot-publish.mjs` `remoteShaDirExists(sha)` uses `git ls-tree origin/<branch> -- sha-<sha>` and checks only the exit code via `shOk`. `git ls-tree` with a missing pathspec exits **0** with empty stdout, so the function returns `true` even when the sha-dir is not on the remote.

Effect: on a fresh feature branch with no prior screenshot run, the publish path takes the early-return ("already has sha-X — skipping push, comment URLs valid"), the sticky PR comment is updated with inline `blob/...?raw=true` URLs that **404**, and the reviewer sees broken images until someone manually republishes.

Observed on PR #308: local sha-dir captured 13 PNGs, script reported skip, `git ls-tree -r origin/screenshots | grep sha-27e25cb` returned empty, comment links 404'd until manual tar-pipe push.

## Users

- **PR authors** pushing a feature branch for the first time — they get a green hook and a useless PR comment.
- **Reviewers** on the PR — they see a screenshots comment with broken images and either ignore it or have to ping the author.

## Proposed behavior

After this ships, the publish script:

1. **Correctly detects** whether `sha-<sha>/` is present on `origin/<screenshots-branch>` (no more false positives on missing paths).
2. **Verifies post-push** that the sha-dir actually landed on the remote before declaring success and writing the sticky PR comment — if the push silently no-op'd or the verification fails, the script exits non-zero and surfaces the failure to the pre-push hook (and CI republish path).
3. **Stays idempotent** on re-publish: when the sha-dir truly exists on remote, the skip path is still taken (no redundant push, no churn in the screenshots branch history).

Adjacent: a defensive sweep of `scripts/screenshot-publish.mjs` for other `shOk(git …)` patterns where exit-0-on-absent could produce the same false positive, fixing any found.

## Success criteria

- On a fresh branch with no prior screenshot run, `pnpm screenshots:publish` (and the lefthook pre-push) push the sha-dir to the screenshots branch instead of skipping.
- After the publish script reports success, `git ls-tree -r origin/<screenshots-branch>` (or equivalent remote check) confirms the sha-dir is present — the script itself runs this confirmation and fails loudly if absent.
- The sticky PR screenshots comment's inline `blob/...?raw=true` URLs load (HTTP 200) on first push, with no manual republish needed.
- On a repeat publish of the same sha, the script still takes the skip path (no redundant push or branch churn).
- Any other `shOk`-on-`git ls-tree`/`git cat-file`-style call in the script that has the same false-positive shape is either fixed or documented as intentional.

## Scope

**In:**
- Fix `remoteShaDirExists` to treat empty stdout as "absent" (or switch to `git cat-file -e origin/<branch>:sha-<sha>` / equivalent).
- Add a post-push verification step that confirms the sha-dir is on the remote after `git push`, before the script exits 0.
- Audit `scripts/screenshot-publish.mjs` for sibling false-positive patterns and fix them.

**Out (explicit anti-goals):**
- Rewriting the publish script's overall architecture (tar-pipe flow, sticky-comment marker, per-sha layout).
- Changing the screenshots branch layout or the URL embed pattern in PR comments.
- Adding screenshot-coverage features or new test tags — see `e2e-screenshot-coverage-expansion.md`.
- Touching `screenshots-main.yml` / `docs/screenshots/latest/` maintenance on `main`.

## Open questions

- **Post-push verification mechanism:** re-run `git ls-tree origin/<branch> -- sha-<sha>` after `git push` (cheap, one extra fetch), or trust the push exit code and only verify on demand? `/plan` to pick.
- **Failure surface:** when post-push verification fails, should the script (a) exit non-zero so the pre-push hook blocks the push, or (b) exit 0 but skip the sticky-comment update so reviewers don't get broken-link comments? `/plan` to decide.
- **Other false-positive sites:** `verifyShaDirOnRemote` around line 530 is a defensive check — does it actually run after the early-return at line 183, or is it dead code on the skip path? Needs read during `/plan`.

## ADR impact

None — tooling/script bug fix. No change to product behavior, sync protocol, schema, or any decision recorded in `adr/`.

## References

- Issue: https://github.com/IIxauII/hnch/issues/309
- Observed on PR #308 (fresh branch, sha `27e25cb`).
- `scripts/screenshot-publish.mjs` (`remoteShaDirExists` ~line 160, early-return ~line 179–183, `verifyShaDirOnRemote` ~line 530).
- CLAUDE.md → "PR screenshots" section (canonical flow description).
