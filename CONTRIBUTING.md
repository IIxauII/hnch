# Contributing to hnch

Thanks for your interest. This document covers how to propose changes, what every PR must include, and how releases are cut from commit history.

## How to contribute

1. Branch from `main` (`git switch -c feat/short-description`). No direct commits to `main`.
2. Make your change in a focused branch.
3. Run the local checks (see [Pre-push checklist](#pre-push-checklist)).
4. Open a PR against `main`.

## PR requirements

Every PR must satisfy all four:

- **PR opened against `main`** — no direct pushes to `main`.
- **Description present** — explain *what* changed and *why*. Link the related ADR (`adr/NNNN-*.md`) or plan (`plans/*.md`) when applicable.
- **All checks pass locally** — `pnpm lint && pnpm typecheck && pnpm test` must be green before pushing. Run `pnpm test:e2e` if the change touches `packages/client`, `packages/relay`, or `packages/shared`.
- **No `Co-Authored-By` trailer** — commit messages must not include a `Co-Authored-By:` line.

## Commit style — Conventional Commits

Because all PRs land via squash merge (see [Merge strategy](#merge-strategy)), the **PR title** is the conventional-commit surface that drives the release — not individual branch commits. Branch commits during review can be sloppy; only the squashed PR title and body end up on `main`.

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

**Scope is required.** PR-title lint enforces an allowlist (see below). Scopeless titles fail CI, and a PR on red CI is not merged (see [Merge only on green CI](#merge-only-on-green-ci)).

| Scope | Use for | Triggers release? |
|-------|---------|-------------------|
| `client` | `packages/client/**` (Angular app) | Yes — `client-v*` (deploys `hnch-web` and the VPS; see [PWA release rules](docs/deployment.md#pwa-release-rules)) |
| `relay` | `packages/relay/**` (Cloudflare Worker + Durable Objects) | Yes — `relay-v*` (deploys `hnch-relay`; see [release rules](docs/deployment.md#relay-release-rules)) |
| `cli` | `packages/cli/**` | Yes — `cli-v*` (npm publish) |
| `shared` | `packages/shared/**` | Yes — `shared-v*` |
| `e2e` | `packages/e2e/**` | No |
| `ci` | `.github/workflows/**`, `infra/runner/**` | No |
| `docs` | Root `*.md`, `docs/**`, `adr/**` | No |
| `infra` | `infra/**` (Caddyfile, systemd, deploy scripts) | No |
| `deps` | Dependency bumps (Dependabot et al.) | No |
| `repo` | Root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, etc.) | No |

### Multi-scope titles

A PR that touches multiple packages MUST list every scope it touches, comma-separated, no spaces. Single-scope titles where the PR also modifies another package's files (silent ride-along) are not allowed — the omitted package gets no version bump and falls out of sync.

```
feat(client,shared): add new vote payload field
fix(relay,shared): correct snapshot TTL calculation
feat(client,cli,shared)!: drop legacy join URL
chore(ci,infra): bump runner image base
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

The commit type drives the release bump — see [Releases](#releases).

## ADR discipline

Any architectural or structural change needs a new ADR in `adr/`. ADRs are immutable once Accepted — direction changes land as a new ADR that supersedes the old one (`Status: Superseded by ADR-XXXX`).

If a PR conflicts with an existing ADR, either reshape the PR to conform or open the superseding ADR first and get agreement before implementing.

When adding an ADR:

- Copy `adr/0000-template.md`.
- Use the next sequential four-digit number.
- Add a row to the index in `adr/README.md`.

See [`adr/README.md`](adr/README.md) for the full conventions.

## PR scope

Keep PRs atomic. One logical change per PR. Avoid drive-by refactors — they make review harder and muddy the release notes.

## Docs in sync

If the change shifts user-visible behavior or product scope, update the relevant doc in the same PR:

- `docs/project.md` — product overview.
- `docs/schema.md` — Yjs document shape.
- `docs/ux.md` — user flows and interaction patterns.
- `docs/roadmap.md` — phased plan and exit bars.
- `docs/angular.md` / `docs/ionic.md` — client coding conventions.

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

## Pre-push checklist

- [ ] Branched from `main`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm test:e2e` passes (if touching client/relay/shared).
- [ ] PR title follows Conventional Commits (drives the release).
- [ ] No `Co-Authored-By` trailers.
- [ ] ADR added/updated if structural.
- [ ] Related docs updated.
- [ ] Before merging: every CI check on the PR is green (see [Merge only on green CI](#merge-only-on-green-ci)).

## Screenshots

Two surfaces, both automated.

> **Not a test gate.** The screenshot harness is a *capture-and-publish* flow: capture visual fixtures, push PNGs, post a sticky PR comment. It does not run `pnpm test:e2e`, does not run the CI `verify` matrix (typecheck / lint / unit / build), and does not gate the push on test results — failures exit 0 in hook mode. A successful run means "PNGs uploaded + comment posted", nothing more. Do not invoke `pnpm screenshots:publish` to validate behavior — use `pnpm test:e2e` or push and let CI run `verify`.

### PR pre-push hook (per-author, scoped)

A `lefthook` pre-push hook (`pre-push.commands.screenshots-capture-and-publish`) runs whenever a push includes changes under `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**`. It:

1. Runs `packages/e2e/tests/_screenshots/` (full suite by default; `.screenshot-tags` in the worktree narrows scope — materialised from the plan doc's `## Screenshot tags` section by `pnpm worktree:add --plan <slug>`).
2. Publishes PNGs to the `screenshots` branch under `sha-<short>/` via `git fetch + reset + push` with retry on rejection (non-force).
3. Updates a sticky PR comment marked `<!-- hnch-screenshots -->` with inline `blob/<branch>/...?raw=true` embeds — the only embed pattern that renders on both mobile and desktop GitHub.

If you push before opening a PR, the hook prints a stderr advisory and exits 0. After `gh pr create`, run `pnpm screenshots:publish` to upload + post the sticky comment manually.

**Bypass:** `git push --no-verify` skips the hook entirely. Use sparingly — the next push that includes a relevant file will re-publish.

**Branch retention:** the `screenshots` branch is **uncapped** (PR-scoped, transient). Do not hand-edit it. See its `README.md`.

### Main CI workflow (canonical reference)

`.github/workflows/screenshots-main.yml` runs on every push to `main` touching the same glob. It runs the full suite and commits PNGs to `main` under `docs/screenshots/<sha>/<feature>/`, updates the `docs/screenshots/latest` symlink, and prunes to the newest 10 sha dirs. Skills (`/triage`, `/plan`, `/spec`, `/critique`) consult `docs/screenshots/latest/<feature>/` on `main` as the canonical "what the app looks like now" reference.

### OUT_DIR layout

Every spec under `packages/e2e/tests/_screenshots/*.spec.ts` resolves its output directory via the shared helper at `_helpers/out-dir.ts`:

```ts
import { resolveOutDir } from './_helpers/out-dir';
const OUT_DIR = resolveOutDir('reveal'); // → docs/screenshots/<sha>/reveal/
```

Slug = the spec's primary `@tag` (see `packages/e2e/README.md` → Tag catalog). When two specs share one feature subfolder, each prefixes its PNG filenames with its basename (`participants-01-roster.png` vs `participant-cap-01-lobby.png`). Do not hardcode `path.resolve(...)` or `fs.mkdirSync(...)` in new specs.

### Scope (ADR-0028)

Both surfaces are developer tooling + repo CI; **no outbound channel is added to shipped client/relay/CLI binaries**. The `gh` CLI uses the contributor's own credentials. This stays within the ADR-0028 (no telemetry) boundary.

### Local manual run

```sh
SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=local \
  pnpm --filter @hnch/e2e exec playwright test _screenshots \
  --project=chromium --workers=1
```

Output lands under `docs/screenshots/local/<feature>/`. This directory is **not** gitignored — keep it out of commits by hand or rm before staging.

### Troubleshooting

- **Hook ran but no comment appeared.** Check that `gh auth status` shows you logged in. The hook bails (exit 0) if `gh` is missing — install via `brew install gh && gh auth login`.
- **Push rejected after capture succeeded.** The retry loop fetches+resets `origin/screenshots` and re-pushes up to 5 times. If all 5 attempts fail, the hook exits 0 (push proceeds); re-run `pnpm screenshots:publish` once the contention clears.
- **Capture took too long, push timed out.** Narrow scope by adding a `## Screenshot tags` section to the plan doc (canonical source) and re-creating the worktree with `pnpm worktree:add <name> --plan <slug>`, or by `HNCH_PLAN_SLUG=<slug> pnpm worktree:bootstrap` inside an existing worktree. As an escape hatch, you can also hand-write `.screenshot-tags` at the worktree root (single line, Playwright `--grep` regex, e.g. `@theming|@layout`). See `packages/e2e/README.md` for the tag catalog.
- **`@{push}` not configured.** First push of a branch falls back to comparing vs `origin/main`. After `git push -u origin <branch>` lands, subsequent pushes use `@{push}` directly.
- **Need to re-publish without pushing code.** `pnpm screenshots:publish` — always runs full capture against `HEAD`, regardless of diff state.
- **Manual escape.** `git push --no-verify` skips the hook completely. The next non-bypassed push that touches a relevant file will republish.

## Merge strategy

All PRs land via **squash merge**. Merge commits and rebase merging are disabled in repo settings (GitHub → Settings → General → Pull Requests). The squash default commit message is set to **"Pull request title"** so the PR title becomes the single commit on `main`.

This isn't cosmetic — it's load-bearing for releases:

- The **PR title is the release-driving commit message**. It MUST follow Conventional Commits (`<type>(<scope>): <subject>`). The CI **`PR title (Conventional Commits)`** job checks it, so a malformed title turns CI red and the PR is not merged (see below); reviewers don't have to police it manually.
- For breaking changes: put the `BREAKING CHANGE:` footer in the **PR description** (which becomes the squash commit body when the GitHub default is "Pull request title and description"), or use `feat!(scope): …` in the title for the simpler case.
- Branch commits during review can be sloppy; only the squashed PR title/body matter for release.

A merge or rebase strategy would let multiple branch commits drive multiple releases per PR — noisy and incorrect. Keep squash-only.

### Merge only on green CI

The repo is private on GitHub Free, so it has no branch protection and nothing blocks a merge on red. Agents and humans follow this by convention:

- Merge only when every CI check on the PR's latest commit is green (`gh pr checks <n> --watch`). A cancelled check is not green: re-run it. A job skipped by `detect-changes` is fine.
- Never merge on red, even when the failure looks unrelated.
- After merging, check `main`'s push CI run for the merge commit (`gh run list --repo IIxauII/hnch --workflow ci.yml --commit <merge-sha>`) and fix forward if it goes red. If a newer merge cancels that run, the newer run covers it.

## Releases

Releases are automated from commit history using [semantic-release](https://semantic-release.gitbook.io/) on every push to `main`. There is no manual release step and no release PR — qualifying commits trigger a tag, changelog entry, GitHub Release, and deploy hook for the affected package.

> **iOS bundle-version caveat (deferred).** Capacitor sync uses `packages/client/package.json` `version` for the native bundle's `CFBundleShortVersionString`. Between releases that file holds the placeholder `0.0.0-semantically-released`, which is **not** a valid bundle version. The native iOS build process (deferred to Phase 6b — see `docs/roadmap.md §9`) will need to read the latest `client-v*` git tag rather than `package.json`. Address this when Phase 6b lands.

### Bump rules

| Commit type | Release |
|-------------|---------|
| `fix:` | Patch (`0.0.X`) |
| `feat:` | Minor (`0.X.0`) |
| `feat!:` or `BREAKING CHANGE:` footer | Major (`X.0.0`) |
| `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `build:`, `ci:` | No release |

### Breaking changes

Mark either with a `!` after the type (`feat!: drop legacy join URL`) or a `BREAKING CHANGE:` footer:

```
feat(client): switch to opaque room tokens

BREAKING CHANGE: clients on <1.4.0 can no longer join.
```

### Per-package versioning

Each package versions independently — `client`, `cli`, `relay`, and `shared` get their own tags (e.g. `relay-v0.4.1`). `e2e` is test-only and is not released. Scope your PR title (`fix(relay): ...`) so the right package picks it up; multi-package PRs use comma-separated scopes (`fix(relay,shared): ...`) and cut one release per listed releasing scope. See [Multi-scope titles](#multi-scope-titles).

Under the hood, each package's `release.config.mjs` (built from `scripts/release/build-releaserc.mjs`) matches its scope via a micromatch extglob — `@(relay|*,relay|relay,*|*,relay,*)` — so the rule fires whether the scope appears alone or anywhere in a comma-separated list. The same scope filter is applied to `@semantic-release/release-notes-generator` (via a wrapped angular preset transform) so release notes only list commits relevant to the released package. Adding a new releasing scope means adding the package to `PACKAGES` in the builder and dropping a one-line `release.config.mjs` in the package.

## Parallel git worktrees

For working on multiple branches in parallel (e.g. running multiple AI agents simultaneously), the repo ships a worktree workflow that gives each worktree its own isolated dev/relay/cli/e2e stack with non-colliding ports.

### Quickstart

From the main repo dir:

```sh
pnpm worktree:add feat-x         # creates ../hnch-feat-x off main
pnpm worktree:add feat-x dev     # off custom base branch
```

This:

1. `git worktree add -b feat-x ../hnch-feat-x main`.
2. Runs `scripts/worktree-bootstrap.sh` inside the new worktree, which:
   - Picks the lowest unused port offset (multiple of 100, skipping 0).
   - Writes `.env.local` with `CLIENT_PORT`, `RELAY_PORT`, `PORT`, `HNCH_RELAY_URL`, `PLAYWRIGHT_BASE_URL`.
   - Runs `pnpm install`.

`flock` serializes concurrent bootstraps so two parallel `pnpm worktree:add` calls won't collide.

All `dev:*` and `test:e2e` scripts auto-source `.env.local` via `scripts/with-env.sh`, so once bootstrapped, `pnpm dev:client`, `pnpm dev:relay`, `pnpm dev:cli`, and `pnpm test:e2e` all use the worktree's offset ports.

### How port isolation works

Convention: `RELAY_PORT = 1234 + (CLIENT_PORT - 4200)`.

The client (`packages/client/src/environments/environment.ts`) derives `relayHttpUrl` and `relayWsUrl` from `window.location.port` at module load — so the PWA at `localhost:4300` automatically connects to the relay at `localhost:1334` with no extra config. Bootstrap writes `.env.local` to keep `RELAY_PORT` in lockstep with this convention; `with-env.sh` warns if they ever drift.

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
- **`.claude/settings.local.json` is per-worktree.** Each new worktree starts with an empty Claude Code permissions allowlist; you'll re-grant common permissions on first use. Anthropic's [issue #40857](https://github.com/anthropics/claude-code/issues/40857) prevents symlink-based sharing today (Claude rewrites the file via atomic replace, which destroys the symlink). Revisit once that lands; until then, accept per-worktree drift.
- **`pnpm worktree:add` does not auto-fetch.** The wrapper calls `git worktree add -b <name> <dir> <baseBranch>` against the local ref, so a stale local `main` (or other base) silently produces a worktree missing recent commits. Always `git fetch origin` *before* `pnpm worktree:add`, or pass an explicit remote-tracking ref like `origin/main`. Symptom of getting this wrong: AI agents in the worktree don't see files added by recently-merged PRs and recreate them from scratch with diverging APIs — local tests pass against the rewrite while CI fails on the merged base.
