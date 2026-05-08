# ADR-0038: Code-quality tooling — Biome (format) + Oxlint (lint) + lefthook (pre-commit) + ratcheted TS strictness

**Status:** Accepted
**Date:** 2026-05-07

## Context

- Format tooling: nothing repo-wide. No Prettier, no Biome, no editorconfig-driven formatter. Style drifts per author.
- Lint tooling: only `packages/client` had a linter (legacy `.eslintrc.json` driving `@angular-eslint` v20 via `ng lint`). `packages/cli`, `packages/relay`, `packages/shared`, `packages/e2e` had zero static analysis beyond `tsc`.
- No pre-commit hooks anywhere — all guards lived in CI, so broken style / lint errors land in branches and burn runner minutes.
- `tsconfig.base.json` enables `strict` plus 5 add'l flags but is missing `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noUnusedLocals`, `noUnusedParameters`, `allowUnusedLabels: false`, `allowUnreachableCode: false` — known gaps vs idiomatic strict TS.
- Stack is performance-sensitive on dev iteration: 5 packages, ~222 source files, contributors expect sub-second feedback locally.
- ESLint + `@typescript-eslint` + Prettier on Node is the conventional choice but slow (multi-second on this tree) and requires multi-config maintenance per package.
- Angular HTML templates need their own linter (`@angular-eslint/template-*`) — no Rust-native tool covers Angular HTML in 2026.
- Repo layout (ADR-0014) and CLI parity (ADR-0021) mean tooling must apply uniformly across all packages, not just the client.
- CI runner pool (ADR-0037) executes lint/typecheck per package — fast tools shorten matrix wall-clock.

## Decision

Adopt **Biome 2.x** for formatting all of TS/JS/JSON/MD repo-wide, **Oxlint 1.x** for linting every package, **lefthook 2.x** for pre-commit hooks (auto-installed on `pnpm install`), and keep **`@angular-eslint/template-*`** scoped to `.html` only via a flat `eslint.config.mjs` in `packages/client`. Ratchet `tsconfig.base.json` with the 6 missing strict flags and bump the TS `lib` target to **ES2023** across `cli`/`client`/`relay`/`shared`.

## Trade-offs

- Three tools instead of one — Biome (format), Oxlint (lint TS/JS), angular-eslint (lint Angular HTML). Cognitive overhead vs single-tool dream is the price for "Rust-fast everywhere we can be."
- Biome 2.x Angular HTML support is incomplete → we cannot consolidate template formatting/linting into Biome yet; angular-eslint stays.
- Oxlint has no Angular plugin → the same constraint as above, on the lint side.
- Oxlint rule coverage is narrower than ESLint + plugins; we lose some niche `eslint-plugin-import` / `eslint-plugin-jsdoc` checks. Calibrated as: `correctness` / `suspicious` / `perf` = error; `pedantic` / `nursery` = warn; `restriction` / `style` = off. `no-async-await` is on as a warn-level RxJS-preference nudge.
- 1543 oxlint warnings in current code (pedantic + nursery + async-await nudge). Errors = 0. Warnings tracked, not blocking — cleanup is opportunistic, not gating.
- Strictest oxlint posture (`restriction` + `pedantic` at error) was tested → ~3000 errors fighting idiomatic patterns (async/await, optional chaining, `undefined`, `!`-assertion). Rejected as not pragmatic.
- Adoption produced a 13k-line format diff in a single commit — git history for those files now has a one-time discontinuity. Mitigated by isolating it in one PR with `.git-blame-ignore-revs`-friendly granularity.
- ES2023 lib bump forced because `oxlint --fix` rewrites to `Array#toSorted` / `Array#toReversed`. Engines (Node 22, modern browsers per ADR-0002 stack) support it natively, but contributors targeting older runtimes locally would see lib drift.
- Pre-commit guard runs on staged files only (sub-second) but can be bypassed with `LEFTHOOK=0 git commit`. Not a security boundary — CI is still the source of truth.
- Ratcheted TS strict flags will surface latent issues across `packages/*` — must be fixed in the same PR or the build is red.
- Trimming client devDeps (`@angular-eslint/eslint-plugin`, `@typescript-eslint/*`, `eslint-plugin-import`, `eslint-plugin-jsdoc`, `eslint-plugin-prefer-arrow`) reduces install surface but is a one-way door for any contributor relying on those rules in editor integrations — they'll need to switch to Oxlint's LSP.

## Consequences

- Easier: single root format pass via `biome` (102 ms over 222 files); single root lint pass via `oxlint` (~70 ms over 222 files); one source of truth for style — no per-package Prettier/ESLint configs to maintain.
- Easier: pre-commit feedback is sub-second, so style/lint errors stop landing in branches and stop burning the self-hosted runner pool (ADR-0037).
- Easier: every package now has `typecheck` + `lint` + `format:check` scripts — CI matrix gains uniform per-package visibility, including `cli`/`relay`/`shared`/`e2e` which previously had no linter.
- Easier: TS strict ratchet (`exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noUnusedLocals`, `noUnusedParameters`, `allowUnusedLabels: false`, `allowUnreachableCode: false`) closes known idiomatic-strictness gaps; the type system now enforces what reviewers were enforcing by hand.
- Easier: contributors run `pnpm -r --if-present <task>` — pnpm's workspace runner is sufficient at 5 packages; no Turborepo/Nx task graph needed yet.
- Easier: lefthook is a Go binary with no Node startup cost and a simple YAML config; auto-installs on `pnpm install` so new clones get hooks without a manual step.
- Harder: contributors must learn three tools' configs (`biome.json`, `.oxlintrc.json`, `eslint.config.mjs` for HTML only) instead of one.
- Harder: Oxlint's editor integration is less mature than ESLint's — IDE squiggles may lag CLI behavior in some editors.
- Harder: any Angular HTML rule change requires touching the flat `eslint.config.mjs` (configured as `@angular-eslint/template/all` minus `i18n`, since we're single-locale).
- Harder: `exactOptionalPropertyTypes` in particular changes the meaning of `field?: T` vs `field?: T | undefined` — call sites that conflated the two will need narrowing.
- Harder: 1543 oxlint warnings represent technical-debt visibility, not silence — contributors must treat them as a moving baseline.
- Revisit when: Biome ships first-class Angular HTML support — consolidate format + lint into a single Biome config and drop angular-eslint entirely.
- Revisit when: Oxlint adds an Angular plugin — drop angular-eslint regardless of Biome HTML support.
- Revisit when: localization scope expands beyond a single locale — re-enable `@angular-eslint/template/i18n` rules.
- Revisit when: repo grows past ~5 packages or task graph develops non-trivial inter-package dependencies — evaluate Turborepo or Nx for incremental builds and remote caching.
- Revisit when: the Node engine minimum is bumped past 22 — consider ES2024+ lib target.
- Revisit when: warning count regresses materially (e.g., > 2000) — tighten oxlint posture or convert categories to error.

## Related

- ADR-0014 (repo layout: pnpm workspaces) — tooling applies uniformly across the workspace surface this ADR establishes.
- ADR-0021 (CLI package parity) — `packages/cli` joins the same lint/format/typecheck regime as the client.
- ADR-0029 (relay deployment) — relay deploys gate on CI lint+typecheck; faster local guards mean fewer broken pipelines blocking deploy tags.
- ADR-0037 (self-hosted runner pool covers CI/CD) — sub-second pre-commit guards reduce wasted runner minutes on the Mac mini M4 pool.
