# CI: add packages/e2e to verify matrix typecheck

**Status:** Draft
**Date:** 2026-05-21
**Source spec:** [docs/specs/ci-e2e-verify-matrix.md](../specs/ci-e2e-verify-matrix.md)
**Shape:** Single PR

## Summary

Close the CI gap that let an undefined-reference in a Playwright spec slip past PR CI and red `screenshots-main` on `main`. Fix the 17 outstanding `TS18048` errors in `vote-dots-196.spec.ts`, add `packages/e2e` to the `verify` matrix so `tsc --noEmit` runs on every relevant PR, and timebox an `oxlint` investigation to see if `no-undef` (or equivalent) can catch the same class earlier in pre-commit.

## Approach

Three coordinated changes in one PR:

1. **Typecheck repair** — destructured array elements in `packages/e2e/tests/_screenshots/vote-dots-196.spec.ts` are typed `T | undefined` under TS strict mode. Apply non-null assertions at the destructure site (e.g. `const [hostC, p2, p3] = clients;` followed by an assert-length helper or `!` on each use site, depending on whichever yields the smallest diff). The helper contract guarantees the array length at runtime, so this is a type-safety surface fix, not a correctness fix.

2. **Verify matrix wiring** — in `.github/workflows/ci.yml` `detect-changes` job, append `'"e2e"'` to the `pkgs` array so `verify-packages` includes `e2e` when relevant. The existing `Verify (${{ matrix.package }})` lane already uses `--if-present` for `test:coverage`, `lint:templates`, and `build` — `packages/e2e/package.json` has `typecheck`, `format:check`, and `lint`, so only those three steps will execute. No build/test step runs for e2e in the verify lane (Playwright stays in the dedicated `e2e` job). The lane's `Build @hnch/shared` step is a no-op for e2e today (no `@hnch/shared` imports in `packages/e2e/**`) — kept as-is for matrix uniformity; cost is negligible (cached, fast).

3. **oxlint spike (timeboxed)** — investigate whether oxlint's `no-undef` rule (or a TS-aware equivalent) can flag missing named-import references in `.ts` spec files without producing false positives on Playwright/Node globals. Bound at ~30 min. If feasible, enable in `.oxlintrc.json` rules. If not, document the finding in the PR description and rely on the CI matrix lane alone.

`tsc` pre-push gate (issue recommendation 4) is explicitly out — CI matrix coverage makes it redundant.

## ADR impact

None — CI matrix configuration, typecheck strictness, and lint rule changes are not architectural decisions recorded in `adr/`. Runner ADRs (0032/0033/0037) describe *where* CI runs, not *which lanes exist*.

## Decisions resolved

1. **TS18048 fix style** — Non-null assertions at destructure (or assert-length helper). Rejected: explicit length guard with throw (more verbose, no real-world signal), refactor helper return type (larger surface, may ripple). **Risk:** `.oxlintrc.json` enables `correctness:error` + `suspicious:error` categories, which may include `no-non-null-assertion`. Mitigation: run `pnpm --filter @hnch/e2e lint` locally with the `!` fix applied before opening PR. If oxlint rejects, fall back to the assert-length helper (Plan B from this decision).
2. **PR shape** — Single PR combining all three items. Rejected: split into 2 or 3 PRs (overhead exceeds the verification value given the small total surface).
3. **Pre-push tsc gate (issue recommendation 4)** — Dropped. CI matrix catches the bug-class on push; pre-push only shifts feedback ~30–60s earlier at the cost of local latency on every push. Less moving parts. **Spec amendment:** spec success criterion *"The same test commit, attempted with `git push`, is blocked by lefthook pre-push before reaching the remote"* is dropped — superseded by the CI matrix lane criterion. The spec file itself is not edited (specs are interview artifacts); this plan is authoritative on the trade-off.
4. **oxlint scope** — Timeboxed spike. Finding captured as an in-tree comment in `.oxlintrc.json` near the `rules` block regardless of outcome (`// oxlint no-undef evaluated <YYYY-MM>; <enabled rule X> OR <not feasible because Y — CI verify lane covers this>`). One-line, grep-able, survives PR-description archaeology. Rejected: documenting only in PR description (write-only), dropping entirely (loses cheap defense-in-depth signal), blocking PR on a working rule (may be infeasible).
5. **Reverse-deps fanout cost** — Accepted. Once `e2e` joins `verify-packages`, the existing `client||relay → e2e` and `shared → all consumers` escalation in `detect-changes` (ci.yml lines ~100–107) means every client- or shared-touching PR runs a fresh `Verify (e2e)` lane: install, build `@hnch/shared`, then e2e typecheck/format/lint. Real cost on the 4-slot runner pool but correctness wins — e2e *is* downstream of those packages and should typecheck when they change. Rejected: scoping verify-packages to direct `e2e=true` only (loses coverage for the exact reverse-dep case the bug came from).

## Phases

### Phase 1 — single PR

- **Scope:**
  - `packages/e2e/tests/_screenshots/vote-dots-196.spec.ts` — non-null assertions on destructured client tuple
  - `.github/workflows/ci.yml` — append `'"e2e"'` to `detect-changes` `pkgs` array
  - `.oxlintrc.json` — conditional `no-undef` rule add (only if spike confirms feasibility)
- **Exit bar:**
  - `pnpm --filter @hnch/e2e typecheck` exits 0
  - `pnpm --filter @hnch/e2e format:check` exits 0
  - `pnpm --filter @hnch/e2e lint` exits 0 (with the chosen TS18048 fix applied)
  - Bug-class proof (local, no CI push): undo the typecheck fix in working tree, run `pnpm --filter @hnch/e2e typecheck`, confirm non-zero exit, then re-apply. Proves the new verify lane will fail on the same class of bug. CI roundtrip is intentionally skipped — pushing a deliberately-broken commit triggers the `screenshot-publish.mjs` pre-push hook (full screenshot capture + sticky PR comment update), which is ~10 min of wasted work for a hypothesis test.
  - oxlint finding captured as one-line comment in `.oxlintrc.json` (enabled rule OR explicit "not feasible because X — CI verify lane covers this")
- **PR title scope:** `ci(e2e): add packages/e2e to verify matrix typecheck and fix vote-dots strict-mode errors`
- **Worktree:** `pnpm worktree:add ci-e2e-verify-matrix main` at execution time (after `git fetch origin`)
- **Depends on:** none

## Open questions

- Exact placement of the non-null assertions (each use site vs. one assert-length helper at top of the test body) — left to implementation judgement; smallest diff wins.
- oxlint feasibility outcome — informational, documented in PR; does not block merge.

## Verification plan

- `pnpm --filter @hnch/e2e typecheck` — local, must exit 0
- `pnpm --filter @hnch/e2e lint` — local, must exit 0
- `pnpm --filter @hnch/e2e format:check` — local, must exit 0
- `pnpm --filter @hnch/e2e test --grep @smoke` (or equivalent narrow subset) — confirm the typecheck fix did not alter runtime behavior in `vote-dots-196.spec.ts`
- **On PR:** confirm the `Verify (e2e)` lane appears in checks and is required green
- **Negative test:** push a scratch commit introducing `const x = undefinedIdentifier;` to a spec, confirm `Verify (e2e)` fails; revert before merge

## Screenshots

**Required:** No

Reason: pure CI/tooling change — no UI surface, no behavior shift visible to users. No screenshot tags section follows; full suite remains the default for unrelated specs and this change does not affect any rendered scene.

## Critique rejected

- **C8 (concurrent branch ordering):** Verified — current branch `fix/screenshots-ci-round-start-import` (commit 7add1c3) modifies only `packages/e2e/tests/_screenshots/reveal-transition.spec.ts` (one-line change). It does NOT touch `vote-dots-196.spec.ts` (the file this plan repairs). No file overlap, no merge ordering risk. Plans may run in parallel.

## References

- Spec: [docs/specs/ci-e2e-verify-matrix.md](../specs/ci-e2e-verify-matrix.md)
- Issue: https://github.com/IIxauII/hnch/issues/289
- Predecessor fix: #288 (screenshots-main red on `main`)
- Bug origin: #284
- Files implicated: `.github/workflows/ci.yml`, `packages/e2e/tests/_screenshots/vote-dots-196.spec.ts`, `.oxlintrc.json`
