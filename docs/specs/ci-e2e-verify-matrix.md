# CI: add packages/e2e to verify matrix typecheck

**Status:** Draft
**Date:** 2026-05-21
**Source:** https://github.com/IIxauII/hnch/issues/289

## Problem

Undefined-reference bugs in Playwright specs slip past PR CI and only surface when `screenshots-main.yml` runs on `main`. Concretely: PR #284 introduced a reference to `ROUND_START` without importing it; PR CI was green; `screenshots-main` then failed on `main`, requiring the #288 fix-up.

Root cause: `.github/workflows/ci.yml`'s `verify` matrix runs `tsc --noEmit` only over packages enumerated in `detect-changes.outputs.verify-packages` (`shared`, `relay`, `client`, `cli`). `packages/e2e` is absent. The dedicated `e2e` job only runs `playwright test`, and Playwright's loader doesn't fail on missing identifiers in code paths not exercised by the selected test set. Pre-commit `oxlint` runs but its `no-undef` does not catch named-import omissions in TS files. Branch protection therefore has no gate that fails on undefined references in e2e specs.

## Users

Contributors authoring or editing Playwright specs under `packages/e2e/tests/**` — primarily the maintainer (xau) and any AI/sub-agent that writes specs. Indirectly, the release pipeline (a red `screenshots-main` blocks the next client release).

## Proposed behavior

A PR that introduces an undefined reference in any e2e spec — including specs not selected by the smoke-screenshot pre-push — fails a required CI lane before merge. Locally, the same class of bug is caught by lefthook pre-push before the contributor pushes.

`oxlint` (already wired into pre-commit) reports the same class of error when staging the file, when feasible without false positives on TS imports.

No change to the runtime behavior of the e2e suite itself; this is a verification surface change only.

## Success criteria

- A test commit that introduces an undefined reference in `packages/e2e/tests/**/*.spec.ts` fails the `Verify (e2e)` lane on the PR.
- `pnpm --filter @hnch/e2e typecheck` exits 0 on `main` (current: 17 `TS18048` errors in `tests/_screenshots/vote-dots-196.spec.ts`).
- The same test commit, attempted with `git push`, is blocked by lefthook pre-push before reaching the remote.
- `oxlint` on a staged spec with an undefined-reference reports the issue (or a documented finding that this is not feasible without unacceptable false-positives, deferred via Open question).

## Scope

**In:**
- Fix the 17 `TS18048` typecheck errors in `tests/_screenshots/vote-dots-196.spec.ts` so `@hnch/e2e typecheck` is green.
- Add `e2e` to the `detect-changes.outputs.verify-packages` list so the `verify` matrix picks it up on relevant PRs.
- Investigate `oxlint` config: determine whether `no-undef` can catch named-import omissions in TS specs without false positives, and tighten if feasible.
- Add a pre-push lefthook step that runs `pnpm --filter @hnch/e2e exec tsc --noEmit` (or equivalent) on the e2e package when spec files are staged for push.

**Out (explicit anti-goals):**
- A per-PR headless smoke-run of newly added screenshot specs (issue recommendation 5). Lower priority and slower; revisit if the above does not close the gap.
- Any change to how `screenshots-main.yml` or `screenshots-pr.yml` themselves work.
- Refactoring or expanding e2e test coverage.
- Tightening typecheck strictness flags globally — fix the actual errors, do not relax the rule.

## Open questions

- Does `oxlint` have a TS-aware `no-undef` mode that distinguishes missing imports from globals, or will enabling it produce false positives on Playwright/Node globals? If false-positive rate is high, document the finding and rely on (1)+(2)+(4) alone.
- For the 17 `TS18048` errors: prefer narrowing via guards/length checks, or non-null assertions? `/plan` decides — but the spec acceptance is "errors fixed", not "fixed a specific way".
- Should the pre-push tsc gate run on every push (slow, ~few seconds) or only when files under `packages/e2e/**` are part of the push? `/plan` to scope.

## ADR impact

None — CI matrix configuration and lint/hook tightening are not architectural decisions recorded in `adr/`. The runner ADRs (0032/0033/0037) describe *where* CI runs, not *which lanes exist*.

## References

- Issue: https://github.com/IIxauII/hnch/issues/289
- Predecessor fix: #288 (screenshots-main red)
- Bug origin: #284
- Files implicated: `.github/workflows/ci.yml`, `packages/e2e/tsconfig.json`, `packages/e2e/tests/_screenshots/vote-dots-196.spec.ts`, `lefthook.yml`, oxlint config

## Screenshot scope (suggested)

None — CI/tooling change with no UI surface.
