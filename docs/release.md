# Merging, releases and screenshots

How a PR lands on `main`, how semantic-release cuts releases from it, and how screenshots are captured. What a contributor needs to make a change is in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Merge strategy

All PRs land via **squash merge**. Merge commits and rebase merging are disabled in repo settings (GitHub → Settings → General → Pull Requests). The squash default commit message is set to **"Pull request title"** so the PR title becomes the single commit on `main`.

This isn't cosmetic — it's load-bearing for releases:

- The **PR title is the release-driving commit message**. It MUST follow Conventional Commits (`<type>(<scope>): <subject>`). The **`PR title (Conventional Commits)`** step of the CI `Detect changed packages` job checks it, so a malformed title turns CI red and the PR is not merged (see below); reviewers don't have to police it manually. Editing the title starts no CI run: fix it, then re-run the failed jobs.
- For breaking changes: put the `BREAKING CHANGE:` footer in the **PR description** (which becomes the squash commit body when the GitHub default is "Pull request title and description"), or use `feat(scope)!: …` in the title for the simpler case.
- Branch commits during review can be sloppy; only the squashed PR title/body matter for release.

A merge or rebase strategy would let multiple branch commits drive multiple releases per PR — noisy and incorrect. Keep squash-only.

### Merge only on green CI

The repo is private on GitHub Free, so it has no branch protection and nothing blocks a merge on red. Agents and humans follow this by convention:

- Merge only when every CI check on the PR's latest commit is green (`gh pr checks <n> --watch`). A cancelled check is not green: re-run it. A job skipped by `detect-changes` is fine. `Verify` sums up the package lanes; `E2E (Playwright)` runs beside them, not after, and starts with the e2e package's typecheck, format check, lint and unit tests. A PR that only edits Markdown at a package's top level (a package README, CHANGELOG or CLAUDE.md) runs no package lane and no e2e; `scripts/ci/changed-lanes.mjs` holds the rules that pick lanes. Each package lane measures coverage and uploads it to Codecov, which posts a coverage comment and a `codecov/patch` check on the PR. That check counts like any other: it fails when the PR's changed lines are less covered than the project overall.
- Never merge on red, even when the failure looks unrelated.
- After merging, check your merge's `ci.yml` push run (`gh run list --repo IIxauII/hnch --workflow ci.yml --event push --commit <merge-sha>`) and fix forward if it goes red. If a newer merge cancelled it, check the newest `main` push run instead (`gh run list --repo IIxauII/hnch --workflow ci.yml --event push --branch main --limit 1`): it covers yours. Don't re-run the old cancelled run; it shares the concurrency group and would cancel the newer one.

A `main` push run tests everything changed since the last green `main` push run, so a merge whose run was cancelled or failed is tested again by the next one. It leaves out the `[skip ci]` release and screenshot commits, and runs the full pipeline when it can't find a green run to start from. Releases wait for a green `main` push run too (see [When a release runs](#when-a-release-runs)), so a red `main` holds back every release until it is fixed.

**Verified-skip** ([ADR-0055](../adr/0055-verified-skip-main-push-run.md)): a PR run records the tree it tested (the PR merged into `main`) in a `verified-tree` artifact, kept 30 days. When you squash-merge a PR whose newest CI run is green and `main` has not moved since that run (the bot's `[skip ci]` commits landing before the run are fine), the merge commit has that same tree, and its `main` push run skips every package lane and e2e and goes green in under a minute. Its `Detect changed packages` summary names the PR run that verified it. Anything else gets the full `main` run as before: `main` moved after the PR run (to get the skip, update the branch with `main` or push to it, then merge once that run is green; re-running the old run tests the same old merge again), a merge since the last green `main` run other than the bot's `[skip ci]` commits, a PR run older than 30 days, a fork PR, or a direct push. A lookup that fails also runs the lanes, with a warning on the run. `scripts/ci/verified-tree.mjs` holds the rules. A verified-skip run uploads no coverage, so Codecov has no report for that commit; later PRs still get their Codecov comment and check, compared against an earlier commit.

## Releases

Releases are automated from commit history using [semantic-release](https://semantic-release.gitbook.io/). There is no manual release step and no release PR — qualifying commits trigger a tag, changelog entry, GitHub Release, and deploy hook for the affected package.

### When a release runs

`release.yml` starts only after a `ci.yml` push run on `main` goes green (a `workflow_run` trigger), and releases the commit that run tested, not whatever `main` holds by then.

- A merge whose CI run is red or cancelled releases nothing. Its commits release with the next green `main` run, which has tested them too (see [Merge only on green CI](#merge-only-on-green-ci)).
- A verified-skip run (a clean squash merge whose PR run was green, see [Merge only on green CI](#merge-only-on-green-ci)) is a green `main` push run like any other: the release starts as soon as it finishes, under a minute after the merge, and releases the merge commit.
- If `main` already holds a newer merge when a green run's release starts, that release publishes nothing and passes; the newer merge's green run releases both. Commits that start no CI run of their own don't count as newer merges: the bot's `[skip ci]` release and screenshot commits, and commits touching only `docs/screenshots/**`. A human commit marked to skip CI does count, and holds back releases until a later merge goes green.
- Every completed CI run on `main` starts a Release run, red and cancelled ones included (PR runs from other branches start none). Those skip, and their run title says why, such as `Release skipped: CI failure on push, not a green main push`; a releasing run is titled `Release: <merge commit subject>`.
- The release isn't among the merge commit's checks. List the runs that weren't skipped with:

  ```sh
  gh run list --repo IIxauII/hnch --workflow release.yml --limit 20 --json createdAt,status,conclusion,url --jq '.[] | select(.conclusion != "skipped") | "\(.createdAt) \(.status) \(.conclusion) \(.url)"'
  ```

  A run's own commit is `main`'s tip when it started; its "Resolve the commit to release" step names the commit it released and the CI run that tested it.
- A release that fails partway: fix the cause, then re-run that Release run (`gh run rerun <id> --failed`). It checks out the same commit, fast-forwards over the release commits already pushed, and resumes with the next package. A merge that lands while a release is pushing fails it the same way; re-running then releases nothing, and that merge's green run releases.
- If a green run's release never started or was cancelled, dispatch it by hand (`gh workflow run release.yml --ref main`). It takes the head commit of the newest green `main` CI run and applies the same rules, so it releases nothing while `main` holds a newer merge with no green run yet. The fix then is to get the next merge green, not to dispatch again.

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

Each package versions independently — `client`, `cli`, `relay`, and `shared` get their own tags (e.g. `relay-v0.4.1`). `e2e` is test-only and is not released. Scope your PR title (`fix(relay): ...`) so the right package picks it up; multi-package PRs use comma-separated scopes (`fix(relay,shared): ...`) and cut one release per listed releasing scope. See [Multi-scope titles](../CONTRIBUTING.md#multi-scope-titles).

Under the hood, each package's `release.config.mjs` (built from `scripts/release/build-releaserc.mjs`) matches its scope via a micromatch extglob — `@(relay|*,relay|relay,*|*,relay,*)` — so the rule fires whether the scope appears alone or anywhere in a comma-separated list. The same scope filter is applied to `@semantic-release/release-notes-generator` (via a wrapped angular preset transform) so release notes only list commits relevant to the released package. Adding a new releasing scope means adding the package to `PACKAGES` in the builder and dropping a one-line `release.config.mjs` in the package.

## Screenshots

Two surfaces, both automated.

> **Not a test gate.** The screenshot harness is a *capture-and-publish* flow: capture visual fixtures, push PNGs, post a sticky PR comment. It does not run `pnpm test:e2e`, does not run the CI `verify` matrix (typecheck / lint / unit / build), and does not gate the push on test results — failures exit 0 in hook mode. A successful run means "PNGs uploaded + comment posted", nothing more. Do not invoke `pnpm screenshots:publish` to validate behavior — use `pnpm test:e2e` or push and let CI run `verify`.

### PR pre-push hook (per-author, scoped)

A `lefthook` pre-push hook (`pre-push.commands.screenshots-capture-and-publish`) runs whenever a push includes changes under `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**`. It:

1. Runs `packages/e2e/tests/_screenshots/` (full suite by default; `.screenshot-tags` in the worktree narrows scope — written by `pnpm worktree:add <name> [base] --tags "<grep>"` or by hand).
2. Publishes PNGs to the `screenshots` branch under `sha-<short>/` via `git fetch + reset + push` with retry on rejection (non-force).
3. Updates a sticky PR comment marked `<!-- hnch-screenshots -->` with inline `blob/<branch>/...?raw=true` embeds — the only embed pattern that renders on both mobile and desktop GitHub.

If you push before opening a PR, the hook prints a stderr advisory and exits 0. After `gh pr create`, run `pnpm screenshots:publish` to upload + post the sticky comment manually.

**Bypass:** `git push --no-verify` skips the hook entirely. Use sparingly — the next push that includes a relevant file will re-publish.

**Branch retention:** the `screenshots` branch is **uncapped** (PR-scoped, transient). Do not hand-edit it. See its `README.md`.

### Main CI workflow (canonical reference)

`.github/workflows/screenshots-main.yml` runs on every push to `main` touching the same glob. It runs the full suite and commits PNGs to `main` under `docs/screenshots/<sha>/<feature>/`, updates the `docs/screenshots/latest` symlink, and prunes to the newest 10 sha dirs. Skills such as `/critique` consult `docs/screenshots/latest/<feature>/` on `main` as the canonical "what the app looks like now" reference.

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
- **Capture took too long, push timed out.** Narrow scope with `.screenshot-tags` at the worktree root: a single line holding a Playwright `--grep` regex, e.g. `@theming|@layout`. Create the worktree with `pnpm worktree:add <name> [base] --tags "<grep>"` to write it, or hand-write the file in an existing worktree. The publish script passes the regex to Playwright as `--grep` (and exports it as `SCREENSHOT_TAGS` for the capture run). See `packages/e2e/README.md` for the tag catalog.
- **`@{push}` not configured.** First push of a branch falls back to comparing vs `origin/main`. After `git push -u origin <branch>` lands, subsequent pushes use `@{push}` directly.
- **Need to re-publish without pushing code.** `pnpm screenshots:publish` — always runs full capture against `HEAD`, regardless of diff state.
- **Manual escape.** `git push --no-verify` skips the hook completely. The next non-bypassed push that touches a relevant file will republish.
