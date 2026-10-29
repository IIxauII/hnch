# CLAUDE.md

## Project

**hnch** — a pointing poker (planning poker) app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Documentation layout

- `docs/project.md` — product + design overview. Authoritative for *what* the product is.
- `docs/schema.md` — Yjs doc schema. Authoritative for the *shape* of session state.
- `docs/ux.md` — user flows + interaction patterns. Authoritative for *what the user does*.
- `docs/roadmap.md` — phased plan + current status. A map, not a spec.
- `docs/angular.md`, `docs/ionic.md`, `docs/cli.md` — client/CLI conventions (consulted from the relevant `packages/*/CLAUDE.md`).
- `adr/` — Architecture Decision Records. Authoritative for *why* each structural choice was made; see `adr/README.md`.

## ADRs

Structural decisions are recorded in `adr/`. **Before any architectural/structural change, read [`adr/README.md`](adr/README.md)** — it defines when an ADR is required, immutability/superseding rules, conventions, and the template.

## Parallel worktrees

Repo supports parallel git worktrees with per-worktree port isolation (`CLIENT_PORT` / `RELAY_PORT`, offset +100 from `4200` / `1234`). Use for multi-phase work to keep `main` clean, or to run dev servers for two features side-by-side.

`pnpm worktree:add <name> [base-branch]` / `worktree:remove <name>` / `worktree:bootstrap`. **Run `git fetch origin` first** — the script branches off the local ref, so a stale `main` produces a worktree missing recent commits (agents may recreate files with diverging APIs). Full workflow in [CONTRIBUTING.md](CONTRIBUTING.md).

## Commit conventions

Commit style, required PR scopes (incl. multi-package comma scopes), screenshots flow, release flow, and pre-push checklist all live in [CONTRIBUTING.md](CONTRIBUTING.md). Read it before committing or opening a PR.

## Agent skills

Per-repo config the engineering skills read. Edit these files directly to change behaviour.

### Issue tracker

GitHub Issues on `IIxauII/hnch`, via the `gh` CLI. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: root `GLOSSARY.md` + ADRs in `adr/`. See [`docs/agents/domain.md`](docs/agents/domain.md).
