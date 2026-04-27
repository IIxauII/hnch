# Code Coverage + Lint Rollout — hnch

## Context

Two infrastructure gaps in the monorepo today (verified `2026-04-27`):

- **Lint** is configured only in `packages/client` (Angular CLI's `ng lint`, `.eslintrc.json` legacy format). `packages/relay`, `packages/shared`, `packages/cli`, `packages/e2e` have no lint script at all. The root `pnpm lint` runs `pnpm -r --if-present run lint` so silently no-ops for four of five packages.
- **Coverage** is not configured anywhere. All four vitest-using packages (relay, shared, cli, client) run `vitest run` without `--coverage`. No threshold gate in CI.

CI (`a26fde7` on branch `ci/github-actions-pipeline`, not yet on `main`) runs `typecheck → lint → test → build` per package via `--if-present`, so dropping new scripts in opts each package in automatically — no workflow rewrite needed for the basics.

Goal: add unified ESLint flat config across non-client TS packages, add Vitest coverage with v8 provider + report-only thresholds, surface coverage in CI, leave room to ratchet thresholds up later.

## Recommended approach

### Phase 1 — Lint (independent, smallest blast radius)

Pick **ESLint 9 flat config** (`eslint.config.js`) at the repo root, share via root `devDependencies`. Per-package `lint` scripts delegate to root config with package-scoped globs.

Why flat config:
- ESLint 9 is the current stable release; legacy `.eslintrc` is deprecated.
- One file at the root replaces 4× package configs. Easier to keep rules consistent.
- Works with `typescript-eslint` v8 (flat-only) and `angular-eslint` v18+ (flat support).

Layout:

- Root `eslint.config.js` — base rules (`@typescript-eslint/recommended-type-checked`, `eslint:recommended`, `unicorn/recommended` minus noisy rules, project-references-aware parser options).
- Package overrides: client adds `angular-eslint` rules; e2e adds `playwright/recommended`; relay/cli enable `n/recommended` for Node-API hygiene.
- Each package's `package.json` gets `"lint": "eslint ."` (no `--cache` initially — too easy to mask staleness; revisit after baseline).
- Migrate `packages/client/.eslintrc.json` rules into the flat config and delete the legacy file. `ng lint` still works (uses `@angular-eslint/builder` which reads flat configs in v18+). If `ng lint` discovery breaks, fall back to `"lint": "eslint src --ext ts,html"` for client only.

Critical files:
- `eslint.config.js` (new) — root config
- `package.json` — add eslint + plugin devDeps
- `packages/{relay,shared,cli,e2e}/package.json` — add `"lint": "eslint ."` script
- `packages/client/.eslintrc.json` — migrate, then delete
- `packages/client/package.json` — keep `"lint": "ng lint"` if `ng lint` reads flat config; otherwise switch to direct eslint

Initial rule set: lean — `recommended` tiers only. No custom rules until a real bug warrants one. Type-checked rules (`recommended-type-checked`) gated to TS files via `files` glob to keep startup snappy.

### Phase 2 — Coverage (depends on Phase 1 only for CI ordering)

Pick **`@vitest/coverage-v8`** (v8 provider) over istanbul:
- Faster (native V8 coverage, no source instrumentation overhead).
- Same data the Chromium debugger uses — reliable for ESM + Angular AOT outputs.
- Istanbul has slightly nicer branch coverage; don't need it day 1.

Per-package `vitest.config.ts` extends a shared base config (`vitest.shared.ts` at repo root) that sets:

```ts
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'lcov', 'html'],
    reportsDirectory: './coverage',
    exclude: ['**/*.spec.ts', '**/*.test.ts', '**/dist/**', '**/*.config.ts'],
    // Report-only at first; ratchet after baseline lands.
    thresholds: undefined,
  },
}
```

`packages/client` already has a `vitest.config.ts` (Angular-specific globals); merge the shared coverage block manually rather than via spread to avoid breaking Karma-replacement quirks. Verify against `packages/client/src/test.ts` if it exists.

Per-package `package.json`:
- `"test": "vitest run"` stays.
- Add `"test:coverage": "vitest run --coverage"`.

CI integration (extend `ci/github-actions-pipeline`'s `ci.yml`):
- Add a step after `Unit tests` per package: `pnpm --filter @hnch/${{ matrix.package }} run --if-present test:coverage`.
- Upload per-package `coverage/` as an artifact via `actions/upload-artifact@v4` (one artifact per matrix shard, names like `coverage-${{ matrix.package }}`).
- Add a downstream `coverage-merge` job (depends on `verify`) that downloads all artifacts and runs a small `merge-coverage.mjs` script to combine `coverage-final.json` files into a single summary; emit a step-summary table.
- Defer Codecov / external upload until after first PR using this lands — avoid third-party token plumbing in the same change.

Critical files:
- `vitest.shared.ts` (new) — shared coverage block
- `packages/{shared,relay,cli,client}/vitest.config.ts` — extend shared base
- `packages/{shared,relay,cli,client}/package.json` — add `test:coverage` script
- `.github/workflows/ci.yml` — add coverage step + merge job (only after a26fde7 lands on main)

Reasonable starting thresholds (report-only, not enforced):
- shared: 90% lines / 85% branches (pure utils, easy to hit)
- relay: 80% / 70%
- cli: 70% / 60%
- client: 60% / 50% (Angular components are hardest to unit-test fully)

Ratchet up after one month of data — never lower.

### Phase 3 — Pre-commit hook (optional, last)

Add `lint-staged` + `husky` so every commit runs eslint + a fast `vitest --changed` on touched files only. Skipped from this plan unless wanted — adds local-dev friction; many teams prefer CI-only enforcement.

## Out of scope

- E2E (Playwright) coverage via instrumented client build — separate plan if needed; e2e gives flow coverage, not unit coverage.
- Mutation testing (Stryker) — premature.
- SonarCloud / CodeClimate — overlap with simple Codecov setup; pick one once thresholds are real.
- Branch protection rule changes on GitHub — owner action, not codebase work.

## Verification

After phase 1:
```bash
pnpm install
pnpm lint                       # all 5 packages pass with no errors
pnpm --filter @hnch/relay lint  # spot check a non-client package
```

After phase 2:
```bash
pnpm -r --if-present run test:coverage
# Each package's coverage/ dir contains lcov.info + index.html
ls packages/relay/coverage/lcov.info
```

CI: open a draft PR after phase 2 lands, confirm:
- `verify` matrix all-green per shard, with `Coverage` step succeeding
- One `coverage-${pkg}` artifact uploaded per shard
- `coverage-merge` job posts a step-summary with per-package %

## Sequencing

1. Phase 1 lint — single PR, low risk, exposes existing latent lint debt.
2. Wait for `a26fde7` (CI pipeline) to land on `main`.
3. Phase 2 coverage — second PR, extends the merged CI workflow.
4. Phase 3 (optional) — third PR, only if pre-commit is wanted.

Don't combine phases in one PR: lint diff will be noisy enough; mixing it with coverage hides regressions in review.
