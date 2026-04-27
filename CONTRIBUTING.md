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

Scope is optional but encouraged when the change is package-local (e.g. `fix(relay): ...`, `feat(client): ...`).

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

- `project.md` — product overview.
- `schema.md` — Yjs document shape.
- `ux.md` — screens, flows, wireframes.
- `roadmap.md` — phased plan and exit bars.
- `angular.md` / `ionic.md` — client coding conventions.

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

## Merge strategy

All PRs land via **squash merge**. Merge commits and rebase merging are disabled in repo settings (GitHub → Settings → General → Pull Requests). The squash default commit message is set to **"Pull request title"** so the PR title becomes the single commit on `main`.

This isn't cosmetic — it's load-bearing for releases:

- The **PR title is the release-driving commit message**. It MUST follow Conventional Commits (`<type>(<scope>): <subject>`). The CI **`PR title (Conventional Commits)`** job is a **required status check** in branch protection — a malformed title blocks merge automatically; reviewers don't have to police it manually.
- For breaking changes: put the `BREAKING CHANGE:` footer in the **PR description** (which becomes the squash commit body when the GitHub default is "Pull request title and description"), or use `feat!(scope): …` in the title for the simpler case.
- Branch commits during review can be sloppy; only the squashed PR title/body matter for release.

A merge or rebase strategy would let multiple branch commits drive multiple releases per PR — noisy and incorrect. Keep squash-only.

## Releases

Releases are automated from commit history using [semantic-release](https://semantic-release.gitbook.io/) on every push to `main`. There is no manual release step and no release PR — qualifying commits trigger a tag, changelog entry, GitHub Release, and deploy hook for the affected package.

> **iOS bundle-version caveat (deferred).** Capacitor sync uses `packages/client/package.json` `version` for the native bundle's `CFBundleShortVersionString`. Between releases that file holds the placeholder `0.0.0-semantically-released`, which is **not** a valid bundle version. The native iOS build process (deferred per `roadmap.md` line 259) will need to read the latest `client-v*` git tag rather than `package.json`. Address this when Phase 6b lands.

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

Each package versions independently — `client`, `cli`, `relay`, and `shared` get their own tags (e.g. `relay-v0.4.1`). `e2e` is test-only and is not released. Scope your commit (`fix(relay): ...`) so the right package picks it up.
