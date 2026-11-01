# Contributing to hnch

Thanks for your interest. This document covers how to propose changes and what every PR must include. How PRs merge, how releases are cut from commit history and how screenshots are published live in [docs/release.md](docs/release.md).

## How to contribute

1. Branch from `main` (`git switch -c feat/short-description`). No direct commits to `main`.
2. Make your change in a focused branch.
3. Run the local checks (see [Pre-push checklist](#pre-push-checklist)).
4. Open a PR against `main`.

## PR requirements

Every PR must satisfy all four:

- **PR opened against `main`** — no direct pushes to `main`.
- **Description present** — explain *what* changed and *why*. Link the related ADR (`adr/NNNN-*.md`) or issue when applicable.
- **All checks pass locally** — `pnpm lint && pnpm typecheck && pnpm test` must be green before pushing. Run `pnpm test:e2e` if the change touches `packages/client`, `packages/relay`, or `packages/shared`.
- **No `Co-Authored-By` trailer** — commit messages must not include a `Co-Authored-By:` line.

## Commit style — Conventional Commits

Because all PRs land via squash merge (see [Merge strategy](docs/release.md#merge-strategy)), the **PR title** is the conventional-commit surface that drives the release — not individual branch commits. Branch commits during review can be sloppy; only the squashed PR title and body end up on `main`.

PR titles follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional-scope>): <subject>
```

Types in use (match existing history — see `git log`):

| Type | Meaning |
|------|---------|
| `feat` | New user-visible feature |
| `fix` | Bug fix |
| `docs` | Docs only |
| `chore` | Tooling, deps, housekeeping |
| `refactor` | Code restructure, no behavior change |
| `test` | Test-only changes |
| `style` | Formatting, no code change |
| `build` | Build system, packaging |
| `ci` | CI config |

**Scope is required.** The CI PR-title check (`scripts/ci/pr-title.mjs`) enforces the types above plus `perf` and `revert`, and an allowlist of scopes (see below). Scopeless titles fail CI, and a PR on red CI is not merged (see [Merge only on green CI](docs/release.md#merge-only-on-green-ci)).

| Scope | Use for | Triggers release? |
|-------|---------|-------------------|
| `client` | `packages/client/**` (Angular app) | Yes — `client-v*` (deploys `hnch-web`; see [PWA release rules](docs/deployment.md#pwa-release-rules)) |
| `relay` | `packages/relay/**` (Cloudflare Worker + Durable Objects) | Yes — `relay-v*` (deploys `hnch-relay`; see [release rules](docs/deployment.md#relay-release-rules)) |
| `cli` | `packages/cli/**` | Yes — `cli-v*` (npm publish) |
| `shared` | `packages/shared/**` | Yes — `shared-v*` |
| `e2e` | `packages/e2e/**` | No |
| `ci` | `.github/**`, `scripts/ci/**` | No |
| `docs` | Root `*.md`, `docs/**`, `adr/**` | No |
| `infra` | `infra/**` (empty since the runner pool retired, [ADR-0056](adr/0056-github-hosted-runners.md)) | No |
| `deps` | Dependency bumps (Dependabot et al., see [Dependency updates](#dependency-updates)) | No |
| `repo` | Root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, etc.) | No |

### Multi-scope titles

A PR that touches multiple packages MUST list every scope it touches, comma-separated, no spaces. Single-scope titles where the PR also modifies another package's files (silent ride-along) are not allowed — the omitted package gets no version bump and falls out of sync.

```
feat(client,shared): add new vote payload field
fix(relay,shared): correct snapshot TTL calculation
feat(client,cli,shared)!: drop legacy join URL
chore(ci,docs): pin a new workflow action and document it
```

Rules:

- **Comma delimiter, no spaces.** `feat(client, shared): ...` fails PR-title lint.
- **Every changed package's scope must appear in the title.** Run `git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u` to confirm coverage before pushing.
- **One commit type for all listed scopes.** `feat(client,shared)` cuts a `feat`-level release for both `client` and `shared`. If client is a `feat` and shared is a `fix`, use the higher type (`feat`); semantic-release will publish each per-package release at the level the type implies for that scope.
- **Non-releasing scopes are allowed alongside releasing ones.** `feat(client,docs): ...` triggers a client minor; `docs` adds nothing. Useful when a feature ships with doc updates in the same PR.
- **Order doesn't matter.** `feat(shared,client): ...` and `feat(client,shared): ...` produce the same set of releases.
- **Breaking changes apply to every listed releasing scope.** `feat(client,shared)!: ...` cuts a major for both. To break only one package, split the PR.

When to split into separate PRs instead of multi-scoping:

- The changes are logically independent and review benefits from being scoped.
- One side is a `feat` and the other is genuinely only a `fix` (multi-scope flattens to the higher type).
- One side is a breaking change and the other is not.
- The PR is large enough that multi-scoping makes the diff hard to review.

The commit type drives the release bump — see [Bump rules](docs/release.md#bump-rules).

## ADR discipline

Read [`adr/README.md`](adr/README.md) before any architectural or structural change. It says when an ADR is needed, how to write and number one, and how a new ADR supersedes an old one.

## PR scope

Keep PRs atomic. One logical change per PR. Avoid drive-by refactors — they make review harder and muddy the release notes.

## Docs in sync

If the change shifts user-visible behavior or product scope, update the relevant doc in the same PR. CLAUDE.md's [Documentation layout](CLAUDE.md#documentation-layout) lists which doc covers what.

## Code-quality tooling

Three tools, split by what each can actually parse:

| Tool | Job | Config |
|---|---|---|
| **Biome 2.x** | Format TS/JS/JSON/MD, repo-wide | `biome.json` |
| **Oxlint 1.x** | Lint every package | `.oxlintrc.json` |
| **`@angular-eslint/template-*`** | Lint Angular `.html` only | `packages/client/eslint.config.mjs` |
| **lefthook 2.x** | Pre-commit hooks | `lefthook.yml` |

It is three and not one because Biome 2.x has no Angular HTML support and Oxlint has no Angular plugin. Collapse to Biome (or drop angular-eslint) the moment either ships Angular HTML coverage; re-enable the `@angular-eslint/template/i18n` rules if we ever go multi-locale.

Root commands: `pnpm format` / `pnpm format:check`, `pnpm lint` / `pnpm lint:fix`, `pnpm typecheck`. Each runs in ~100-150 ms over the tree. Every package has `typecheck` + `lint` + `format:check`, so the CI matrix has uniform per-package visibility.

The per-package `lint` / `format:check` scripts call the root's `oxlint` / `biome`. pnpm only puts the root's `node_modules/.bin` on a package script's PATH when `ignore-scripts` is off, so with `ignore-scripts=true` in your npmrc they fail with `spawn ENOENT`. Run the root commands instead, or pass `--config.ignore-scripts=false`.

### Oxlint calibration

- `correctness` / `suspicious` / `perf` → **error**
- `pedantic` / `nursery` → **warn**
- `restriction` / `style` → **off**
- `no-async-await` → warn, as a soft RxJS-preference nudge

Errors gate; warnings do not. The warning count is a tracked baseline, not silence — cleanup is opportunistic. Putting `restriction` + `pedantic` at error level was tried and produced ~3000 errors fighting idiomatic patterns (async/await, optional chaining, `undefined`, `!`-assertion); rejected.

### TypeScript strictness

`tsconfig.base.json` runs `strict` plus `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noUnusedLocals`, `noUnusedParameters`, `allowUnusedLabels: false`, `allowUnreachableCode: false`.

`exactOptionalPropertyTypes` is the one that bites: `field?: T` and `field?: T | undefined` stop being interchangeable, so call sites that conflated them need narrowing.

`lib` is `ES2023` in `cli` / `client` / `relay` / `shared` — required because `oxlint --fix` rewrites to `Array#toSorted` / `Array#toReversed`. Bump to ES2024+ only when the Node engine minimum moves past 22.

### Pre-commit hooks

lefthook auto-installs on `pnpm install`, so a fresh clone gets hooks with no manual step. It runs on **staged files only** (sub-second). Bypass with `LEFTHOOK=0 git commit` — it is a fast-feedback guard, not a security boundary. CI remains the source of truth.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens one PR per package family, every Monday, because each lockfile change runs the full pipeline:

| Group | Covers | Majors |
|---|---|---|
| `angular` | `@angular/*`, `@angular-devkit/*`, `@angular-eslint/*`, `@analogjs/*`, `zone.js`, `typescript` | In the group |
| `ionic-capacitor` | `@ionic/*`, `@capacitor/*`, `@capacitor-mlkit/*`, `ionicons` | In the group |
| `yjs` | `yjs`, `y-*`, `lib0` | In the group |
| `dev-tooling` | Test, lint, format, build and release tooling (vitest, Playwright, Biome, Oxlint, semantic-release, wrangler and more; `.github/dependabot.yml` holds the full pattern list) | One PR each |
| `other` | Every other npm dependency | One PR each |
| `github-actions` | Every action in `.github/` | In the group |

Security updates are grouped the same way (the `*-security` groups). `@types/node` majors are ignored: it tracks the `engines.node` minimum.

Every Dependabot title is `chore(deps): …`, dev dependencies included, so it passes the PR-title lint. `chore(deps)` cuts no release; a bumped runtime dependency ships with the package's next release.

## Pre-push checklist

- [ ] Branched from `main`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm test:e2e` passes (if touching client/relay/shared).
- [ ] `pnpm test:ci-scripts` passes (if touching `scripts/ci/`).
- [ ] PR title follows Conventional Commits (drives the release).
- [ ] No `Co-Authored-By` trailers.
- [ ] ADR added/updated if structural.
- [ ] Related docs updated.
- [ ] Before merging: every CI check on the PR is green (see [Merge only on green CI](docs/release.md#merge-only-on-green-ci)).

## Screenshots

A pre-push hook captures a PR's screenshots, and main's e2e run captures main's reference set; both publish to the `screenshots` branch, and neither is a test gate.
Hook, bypass, layout and troubleshooting: [docs/release.md › Screenshots](docs/release.md#screenshots).

## Merge strategy

PRs land by squash merge, only on green CI, so the PR title becomes the commit that drives the release.
Details: [docs/release.md › Merge strategy](docs/release.md#merge-strategy).

## Releases

semantic-release cuts per-package releases from the squashed PR titles after a green `main` CI run.
When a release runs, bump rules and recovery: [docs/release.md › Releases](docs/release.md#releases).

## Parallel git worktrees

For working on multiple branches in parallel (e.g. running multiple AI agents simultaneously), the repo ships a worktree workflow that gives each worktree its own isolated dev/relay/cli/e2e stack with non-colliding ports.

### Quickstart

From the main repo dir:

```sh
pnpm worktree:add feat-x                          # creates ../hnch-feat-x off main
pnpm worktree:add feat-x dev                      # off custom base branch
pnpm worktree:add feat-x main --tags "@viewer"    # also scopes the pre-push screenshot capture
```

This:

1. `git worktree add -b feat-x ../hnch-feat-x main`.
2. Runs `scripts/worktree-bootstrap.sh` inside the new worktree, which:
   - Picks the lowest unused port offset (multiple of 100, skipping 0).
   - Writes `.env.local` with `CLIENT_PORT`, `RELAY_PORT`, `PORT`, `HNCH_RELAY_URL`, `PLAYWRIGHT_BASE_URL`.
   - Runs `pnpm install`.
3. With `--tags "<grep>"`, writes the regex to `.screenshot-tags` in the new worktree so the pre-push screenshot hook captures only matching scenes ([docs/release.md › Screenshots](docs/release.md#screenshots)).

`flock` serializes concurrent bootstraps so two parallel `pnpm worktree:add` calls won't collide.

All `dev:*` and `test:e2e` scripts auto-source `.env.local` via `scripts/with-env.sh`, so once bootstrapped, `pnpm dev:client`, `pnpm dev:relay`, `pnpm dev:cli`, and `pnpm test:e2e` all use the worktree's offset ports.

### How port isolation works

Convention: `RELAY_PORT = 1234 + (CLIENT_PORT - 4200)`.

The client (`packages/client/src/environments/environment.ts`) derives `relayHttpUrl` and `relayWsUrl` from `window.location.port` at module load — so the PWA at `localhost:4300` automatically connects to the relay at `localhost:1334` with no extra config. The `e2e` build configuration that CI's Playwright runs serve (`pnpm --filter @hnch/client build:e2e`) keeps this file, so it derives the relay the same way. Bootstrap writes `.env.local` to keep `RELAY_PORT` in lockstep with this convention; `with-env.sh` warns if they ever drift.

### Other commands

```sh
pnpm worktree:bootstrap          # (re-)provision the current worktree (regenerates .env.local)
pnpm worktree:remove feat-x      # removes the worktree (refuses if dirty)
```

You can also use plain `git worktree add` if you don't want the wrapper — just remember to `cd` in and run `pnpm worktree:bootstrap` afterward.

### Notes and limits

- **Don't run `dev:relay` and `test:e2e` simultaneously in the same worktree.** Playwright's `reuseExistingServer` may pick up a relay started without the test env vars (`HNCH_ROOM_CAP`, `HNCH_ENABLE_TEST_ROUTES`), producing confusing failures.
- **The relay runs on local workerd.** `pnpm dev:relay` goes through `packages/relay/scripts/dev.mjs`, which maps `PORT` and the ADR-0027 vars onto `wrangler dev` (no `.dev.vars`) and keeps rooms in `packages/relay/.wrangler/state` between restarts; with a test var set it starts empty every time. The relay bundles `@hnch/shared`'s built leaf modules, so build shared first (`pnpm dev:relay` does). Relay unit tests run inside workerd (`pnpm --filter @hnch/relay test`, vitest 4 with `@cloudflare/vitest-plugin`); the CLI and shared suites start a relay through `@hnch/relay/testing`.
- **Capacitor `cap add ios`/`cap sync` are per-worktree.** Each worktree gets its own `ios/` dir and CocoaPods install (~500 MB). The CocoaPods cache (`~/Library/Caches/CocoaPods/`) is shared and safe.
- **CLI config (`~/.config/hnch/config.json`) is user-level**, shared across worktrees. `HNCH_RELAY_URL` is set per worktree via `.env.local` so the CLI talks to the right relay; but `participantId`, `displayName`, etc. are shared. For per-worktree CLI identity, set `XDG_CONFIG_HOME=$(pwd)/.cli-config` before `pnpm dev:cli`.
- **Playwright browser cache (`~/.cache/ms-playwright`) is shared.** First-run install across two fresh worktrees in parallel may race; subsequent runs are fine.
- **Linux/macOS only.** `with-env.sh` and `worktree-bootstrap.sh` are bash. Windows contributors will need WSL or equivalent.
- **Claude Code permissions.** The committed `.claude/settings.json` allows read-only git and gh commands plus `git fetch`, file listing and search, and the `typecheck`, `test`, `lint`, `build` and `format:check` scripts, so a fresh worktree runs them without a prompt. Pushes, installs, script flags that write files (`--write`, `--fix`, `-u`) and anything destructive still prompt. Grants you add on top land in `.claude/settings.local.json`, which is gitignored and per-worktree.
- **`pnpm worktree:add` does not auto-fetch.** The wrapper calls `git worktree add -b <name> <dir> <baseBranch>` against the local ref, so a stale local `main` (or other base) silently produces a worktree missing recent commits. Always `git fetch origin` *before* `pnpm worktree:add`, or pass an explicit remote-tracking ref like `origin/main`. Symptom of getting this wrong: AI agents in the worktree don't see files added by recently-merged PRs and recreate them from scratch with diverging APIs — local tests pass against the rewrite while CI fails on the merged base.
