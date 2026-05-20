# Move `.screenshot-tags` writing into worktrees

**Status:** Draft
**Date:** 2026-05-20
**Source:** parallel-worktree collision — `/spec`, `/plan` running in two worktrees overwrite each other's `.screenshot-tags` on `main`.

## Problem

`.screenshot-tags` is gitignored but lives at repo root. The `/spec` and `/plan` skills write it directly during plan/spec authoring. When two agents author plans in parallel (different worktrees, or the user iterates on `main` while a worktree runs), the file at the **main checkout's root** gets overwritten on every run. The pre-push hook inside a worktree reads its own `.screenshot-tags`, but the main checkout's stray file is confusing and bleeds across plans.

Root cause: tags are an artifact of *a specific change*, not a global repo state. They belong to the plan/PR — and physically to the worktree executing it. Today they are written to whichever cwd the skill ran in (usually `main`).

## Goals

- Tags are authored once, in the plan doc — the same place that describes the change.
- The `.screenshot-tags` file only ever materialises **inside a worktree**, never on `main`.
- The pre-push hook contract is unchanged (still reads `.screenshot-tags` at worktree root).
- Existing plans without a tag line keep working (= full suite, current default).

## Non-goals

- Changing the tag catalog or the hook's regex semantics.
- Adding tags to spec docs (decision: plan-only canonical source).
- Re-publishing screenshots already captured.

## Approach

Three coordinated changes, single PR:

1. **Plan doc is the canonical tag source.** A `## Screenshot tags` section in `docs/plans/<slug>.md` holds a single fenced line with a Playwright `--grep` regex. Absent section = no scoping.
2. **`worktree:add` writes the file.** `pnpm worktree:add <name> --plan <slug>` (or auto-detect when `<name>` matches `docs/plans/<name>.md`) parses the tag line from the plan and writes `.screenshot-tags` inside the new worktree, never anywhere else.
3. **Skills stop writing `.screenshot-tags`.** `/spec`, `/plan`, `/critique` are updated:
   - `/spec`: no longer writes the file. (Tags can be drafted in spec for handoff, but are not authoritative.)
   - `/plan`: writes the `## Screenshot tags` section into the plan doc. Hard-blocks writing `.screenshot-tags` if `git rev-parse --abbrev-ref HEAD` resolves to `main` or cwd is the primary git worktree.
   - `/critique`: reads from the plan doc instead of `.screenshot-tags`.

## Plan-doc tag section format

Single canonical heading. Example:

```markdown
## Screenshot tags

`@viewer|@participants`

Rationale: change touches viewer-role UI in lobby participant list.
```

Parsing rule: first inline code span under `## Screenshot tags` is the regex. Anything else under the heading is human-readable rationale. Multiple lines / multiple code spans → first wins. Section absent → no file written, full suite (existing behaviour).

## Phases

### Phase 1 — single PR, scope `feat(repo)`

Worktree branch: `screenshot-tags-in-worktree` (use `pnpm worktree:add screenshot-tags-in-worktree --plan screenshot-tags-in-worktree` once Phase 1 is itself parseable — bootstrap from a hand-written file otherwise).

Files to change:

- `.claude/commands/plan.md` — rewrite the "Visual context" → screenshot tags paragraph. Skill writes `## Screenshot tags` block into the plan doc. Adds explicit refusal: if cwd is the primary worktree (detect via `git rev-parse --git-common-dir` == `.git`, i.e. not a worktree subdir), do NOT write `.screenshot-tags`. Mention that `pnpm worktree:add --plan <slug>` is the path to the file in a worktree.
- `.claude/commands/spec.md` — remove the `.screenshot-tags` writing instruction. Spec stops authoring tags. (Optional: spec may suggest tags in a "Screenshot tags (suggested)" section that `/plan` then promotes; out of scope for v1.)
- `.claude/commands/critique.md` — read tags from plan doc instead of `.screenshot-tags`. Update missed-scope check.
- `scripts/worktree-add.mjs` — accept `--plan <slug>` flag. After bootstrap, read `docs/plans/<slug>.md`, parse first inline code span under `## Screenshot tags`, write to `<worktree>/.screenshot-tags`. If `--plan` omitted but `<name>` matches an existing `docs/plans/<name>.md`, auto-detect (log it). If the plan has no tag section, log "no scoping; full screenshot suite will run" and skip. If `--plan <slug>` is given but the plan file is missing, exit non-zero.
- `scripts/worktree-bootstrap.sh` — accept `HNCH_PLAN_SLUG` env var as a re-bootstrap path; same parser. Idempotent (writes only when section parses cleanly; never deletes an existing `.screenshot-tags`).
- `packages/e2e/README.md` — update the "Skills" paragraph: tags live in plan doc, materialised by `worktree:add --plan`. Hook contract unchanged.
- `CONTRIBUTING.md` — same: docs section pointing to plan as canonical source.
- (Optional) `.gitignore` — already covers `.screenshot-tags`. Add a comment cross-ref to this plan.

Tests / verification:

- Manual: `pnpm worktree:add tags-smoke --plan screenshot-tags-in-worktree`; assert `.screenshot-tags` exists in the new worktree, does NOT exist in main checkout. Smoke a pre-push to confirm the hook reads it.
- Manual: re-run `pnpm worktree:bootstrap` in that worktree with no env var → existing file untouched. With `HNCH_PLAN_SLUG=other-plan` → overwritten.
- Manual: in main checkout, run `/plan` flow against a UI-touching spec → confirm only the plan markdown is edited; no `.screenshot-tags` appears.

Acceptance:

- `git status` on `main` after a `/plan` run touching UI: clean of `.screenshot-tags`.
- `cat ../hnch-<branch>/.screenshot-tags` matches the regex inline-coded in the plan doc.
- Pre-push hook in the worktree still narrows capture to the tagged subset.

PR title: `feat(repo): move .screenshot-tags writing into worktrees, source from plan doc`.

## Critique (self)

What might be missed:

1. **Re-vote / iteration in an existing worktree.** User edits tags in the plan doc mid-flight. Currently no resync. Mitigation: document `HNCH_PLAN_SLUG=<slug> pnpm worktree:bootstrap` as the re-sync command. Lightweight, no daemon.
2. **Slug ≠ branch name.** Branch naming is loose; some PRs use shorter branches than plan slugs. The `--plan` flag covers this; auto-detect is best-effort only. Document explicitly: "if branch name doesn't match plan filename, pass `--plan`".
3. **Multi-phase plan with different tag scopes per phase.** Current design treats one plan = one tag line. If a 3-PR plan has distinct UI scope per phase, the plan doc could grow `## Screenshot tags (phase 2)` etc. Out of scope for v1; mitigation: write the plan-level tags as the union, then narrow inside the worktree manually if needed.
4. **Spec-only changes that never become plans.** If someone pushes from a worktree authored from `/spec` alone, tags are not propagated. Acceptable: spec without plan is a rare path; absent file = full suite.
5. **`worktree:remove` cleanup.** `.screenshot-tags` lives inside the worktree dir; `git worktree remove` deletes the dir. No leak.
6. **Cross-machine consistency.** The file is gitignored. Anyone re-cloning the worktree onto a fresh machine has to re-run bootstrap with `HNCH_PLAN_SLUG`. Document in CONTRIBUTING.
7. **Race with skill running concurrently across worktrees on the plan doc itself.** Plan markdown lives on a branch — each worktree edits its own copy. Conflicts on merge but no overwrite collision at runtime. Net improvement over the status quo.
8. **`/critique` invoked before plan doc is finalised.** Today it reads `.screenshot-tags`; under the new flow it reads the plan doc. If the plan section is empty, critique flags "no tags written" — same severity as today's "absent file".
9. **`.screenshot-tags` written by humans directly.** Still allowed. The skill refusal only applies to skills; manual `echo '@host' > .screenshot-tags` in a worktree is fine. Document as the escape hatch.
10. **`worktree:add` accepting `--plan` when the plan doesn't yet exist.** During the very first `/plan` run, the plan file is being authored in the main checkout. The user would create the worktree after the plan is committed (or at least written) on `main`. Document the order: `/plan` (writes plan doc on main) → commit/stage the plan → `pnpm worktree:add <name> --plan <slug>`. Acceptable friction; matches existing `worktree-per-phase` memory.

Risks not mitigated above:

- None critical. The change is mechanical and reversible.

## Out of scope

- Auto-publishing screenshots without the hook.
- Storing tags in a structured front-matter (e.g. YAML) — markdown section is simpler for skills + humans.
- Validating tag regex against the catalog at write time (could be a follow-up).
