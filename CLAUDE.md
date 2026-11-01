# CLAUDE.md

## Project

**hnch** — a pointing poker (planning poker) app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Documentation layout

The one list of project docs; README and CONTRIBUTING point here. A fact lives in one of them and the others link to it.

- [`docs/project.md`](docs/project.md) — product + design overview. Authoritative for *what* the product is, incl. the room-code format and the participant cap.
- [`docs/schema.md`](docs/schema.md) — Yjs doc schema. Authoritative for the *shape* of session state, incl. the host-election rule.
- [`docs/ux.md`](docs/ux.md) — user flows + interaction patterns. Authoritative for *what the user does*.
- [`docs/roadmap.md`](docs/roadmap.md) — phased plan + current status. A map, not a spec.
- [`docs/deployment.md`](docs/deployment.md) — production hosting on Cloudflare: topology, deploy flow, rollback.
- [`docs/release.md`](docs/release.md) — how PRs merge, how releases are cut from commit history, and the screenshot flow.
- [`docs/angular.md`](docs/angular.md), [`docs/ionic.md`](docs/ionic.md), [`docs/cli.md`](docs/cli.md) — client/CLI conventions (consulted from the relevant `packages/*/CLAUDE.md`).
- [`docs/comments.md`](docs/comments.md) — comment convention for every package: what a comment or JSDoc may say, issue-reference form, no banners.
- [`adr/`](adr/README.md) — Architecture Decision Records. Authoritative for *why* each structural choice was made.
- [`GLOSSARY.md`](GLOSSARY.md) — domain terms and the names to avoid.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — commit and PR rules, worktrees and dev ports.
- [`SECURITY.md`](SECURITY.md) — how to report a vulnerability privately, and what is supported.

## ADRs

Structural decisions are recorded in `adr/`. **Before any architectural/structural change, read [`adr/README.md`](adr/README.md)** — it defines when an ADR is required, immutability/superseding rules, conventions, and the template.

## Parallel worktrees

Repo supports parallel git worktrees with per-worktree port isolation ([how port isolation works](CONTRIBUTING.md#how-port-isolation-works)). Use for multi-phase work to keep `main` clean, or to run dev servers for two features side-by-side.

`pnpm worktree:add <name> [base-branch]` / `worktree:remove <name>` / `worktree:bootstrap`. **Run `git fetch origin` first** — the script branches off the local ref, so a stale `main` produces a worktree missing recent commits (agents may recreate files with diverging APIs). Full workflow in [CONTRIBUTING.md](CONTRIBUTING.md).

## Commit conventions

Commit style, required PR scopes (incl. multi-package comma scopes) and the pre-push checklist live in [CONTRIBUTING.md](CONTRIBUTING.md). Read it before committing or opening a PR. The merge, release and screenshot flows live in [docs/release.md](docs/release.md).

## Agent skills

Per-repo config the engineering skills read. Edit these files directly to change behaviour.

### Issue tracker

GitHub Issues on `IIxauII/hnch`, via the `gh` CLI. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

Specs and plans are issues, not repo files: publish a spec with the `to-spec` skill and split it into tickets with `to-tickets` (both from the `mattpocock-skills` plugin). `/critique` reviews an issue; `/swarm` executes one.

### Triage labels

The five canonical roles, each label string equal to its name. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: root `GLOSSARY.md` + ADRs in `adr/`. See [`docs/agents/domain.md`](docs/agents/domain.md).
