# Plan — Test coverage reporting

Status: **in progress** (Phase 1)
Owner: xau
Created: 2026-05-13

## Goal

Per-package unit-test coverage for `client`, `relay`, `shared`, `cli`. Surface results in two places:

1. **PR comment** with diff coverage + per-package totals (sticky, updates on push).
2. **Repo overview** — Codecov dashboard + README badges per package.

E2E coverage (Playwright) **out of scope** for v1 — istanbul-instrumented client build doubles CI cost for low marginal signal vs. unit tests.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Coverage provider | Vitest `v8` | All 4 unit packages already use Vitest; v8 is fastest, no babel transform. |
| Display backend | **Codecov** with per-package flags | SaaS dashboard + trend history + native flag UI. Free private tier covers solo repo. |
| Diff-coverage gate | **Warn-only** initially | Establish baseline 2 weeks before enforcing. |
| E2E coverage | **Skipped v1** | Playwright istanbul wiring (separate instrumented build, per-page `__coverage__` dump + nyc merge) is expensive and overlaps unit coverage. |
| Per-package split | Codecov **flags** (`client` / `relay` / `shared` / `cli`) with `paths` filters | Already-matrixed `verify` lane uploads 1 flag per lane. |

## Phases

### Phase 1 — local coverage wiring

PR scope: `feat(shared,relay,client,cli): wire vitest coverage`

- Add `@vitest/coverage-v8` as root devDep (hoisted, single version).
- Per-package `vitest.config.ts` — add `test.coverage`:
  - `provider: 'v8'`
  - `reporter: ['text', 'lcov', 'json-summary']`
  - `reportsDirectory: './coverage'`
  - `include: ['src/**']`
  - `exclude: ['**/*.test.ts', '**/*.spec.ts', '**/test-setup*', '**/*.d.ts', 'src/main.ts', 'src/environments/version.ts']`
- Per-package `package.json` script: `"test:coverage": "vitest run --coverage"`.
- Root `package.json`: `"test:coverage": "pnpm -r --if-present run test:coverage"`.
- `.gitignore` — add `packages/*/coverage/`.
- Verify locally:
  - `pnpm test:coverage` succeeds for all 4 packages.
  - Each emits `packages/<pkg>/coverage/lcov.info` and `coverage-summary.json`.

Exit: green local run, all 4 lcov files present.

### Phase 2 — CI integration

PR scope: `ci(ci): wire coverage uploads`

- `.github/workflows/ci.yml`:
  - `verify` matrix "Unit tests" step → replace with `test:coverage`.
  - New step: upload artifact `coverage-${{ matrix.package }}` containing `packages/${{ matrix.package }}/coverage/` (retention 14 d).
  - New step: `codecov/codecov-action@v5`
    - `flags: ${{ matrix.package }}`
    - `files: packages/${{ matrix.package }}/coverage/lcov.info`
    - `token: ${{ secrets.CODECOV_TOKEN }}`
    - `fail_ci_if_error: false` (warn-only)
- Repo secret: `CODECOV_TOKEN` (set via `gh secret set` after Codecov repo activation).

Exit: PR shows Codecov bot comment with 4 flag rows.

### Phase 3 — Codecov config

PR scope: `ci(ci): add codecov.yml`

- Root `codecov.yml`:
  - `coverage.status.project.{client,relay,shared,cli}` — `target: auto`, `threshold: 1%`, `informational: true` (warn-only).
  - `coverage.status.patch.default` — `informational: true`, threshold 0% (report only).
  - `flag_management.individual_flags` per package with `paths: packages/<pkg>/src/`.
  - `comment.layout: 'header, diff, flags, components, files'`, `behavior: default`, `require_changes: false`.
  - `ignore: ['**/*.test.ts', '**/*.spec.ts', '**/test-setup*', 'packages/e2e/**', 'docs/**', 'adr/**', 'infra/**', 'scripts/**']`.
- Validate via `curl --data-binary @codecov.yml https://codecov.io/validate`.

Exit: Codecov PR comment lists 4 flags, diff coverage column populated.

### Phase 4 — repo surface

PR scope: `docs(repo): coverage badges + ADR`

- `README.md`: 4 badges (one per package flag).
- `docs/coverage.md`: how to read reports, how to run locally, gate semantics.
- New ADR `adr/00XX-coverage-reporting.md` (next number after audit) — locks the decisions above. Alternatives section covers Coveralls, action-only, octocov.

Exit: ADR merged, badges visible on README.

### Phase 5 — tighten gates (deferred, ~2 weeks post-Phase 4)

- Pull baseline coverage % per flag from Codecov.
- Flip `informational: false` on `patch` with target `auto` and threshold matching observed diff coverage.
- Add `Codecov Patch` + per-flag `Codecov Project` to branch-protection required checks.

Exit: PRs blocked when patch coverage drops below baseline.

## Per-phase worktree mapping

Each phase = separate worktree + PR (per `feedback_worktree_per_phase` rule).

- Phase 1: `hnch-coverage` (this worktree, branch `coverage`)
- Phase 2: `hnch-coverage-ci` (after Phase 1 merged)
- Phase 3: `hnch-coverage-config`
- Phase 4: `hnch-coverage-docs`

## Open follow-ups

- Re-evaluate e2e coverage after Phase 6b (native iOS) — instrumented build may already exist for other reasons.
- Consider component-grouping in Codecov (`components` config) once `client` flag is too coarse (split feature-area).
- **Lint/code-quality dashboard** — see "Deferred: lint visibility" below.

## Deferred: lint visibility (GitHub Code Scanning)

Out of scope for this plan, documented for future pickup.

Current state: `oxlint` (all packages) + `eslint` (client templates) + `biome` (formatting) run in the `verify` matrix. Failures block PR. No dashboard, no trend, no per-PR inline annotations beyond CI log output.

Option to add native lint dashboard without new SaaS: **GitHub Code Scanning** via SARIF upload.

Sketch:

1. Per `verify` matrix lane, run `oxlint --format=github` (inline annotations) **and** `oxlint --format=sarif --output-file=oxlint-${{ matrix.package }}.sarif` (machine-readable).
2. New step: `github/codeql-action/upload-sarif@v3` with `sarif_file: oxlint-${{ matrix.package }}.sarif`, `category: oxlint-${{ matrix.package }}`.
3. Repo permissions: `security-events: write` on the verify job.
4. Result:
   - PR annotations inline on changed lines (native GitHub UI).
   - Security tab → "Code scanning" lists all open issues per category (= per package).
   - History/trend graph per category.

Cost: zero SaaS, zero new tooling. Adds ~5 s per lane. No gates added initially (informational), can promote to required check later.

Alternatives evaluated:
- **SonarCloud** — richest dashboard (lint + coverage + duplication + complexity). Free for OSS only, paid for private. Rejected (private repo).
- **DeepSource** — free tier for small private repos. Good PR comments. New SaaS, account, integration cost. Rejected unless GH Code Scanning proves insufficient.
- **Codacy** — similar to DeepSource. Rejected for same reason.

Trigger to revisit: when CI log scanning becomes the bottleneck for understanding lint debt, or when introducing a third linter that needs a unified view.
