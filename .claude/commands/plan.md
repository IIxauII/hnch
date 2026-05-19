---
description: Turn a spec or issue into an implementation plan at docs/plans/<slug>.md, surfacing every load-bearing decision to the user before finalizing
---

$ARGUMENTS

## Purpose

Produce an implementation plan ready for execution. Output: `docs/plans/<slug>.md`. Multi-PR work is split into phases, each phase getting its own worktree at execution time (not now).

You are the **plan orchestrator**. You delegate research and drafting to the `planner` agent, but you OWN the decision-surfacing loop with the user. The planner must NOT silently resolve trade-offs — you intercept and ask.

## Input

`$ARGUMENTS` is one of:

- **Path to spec** — `docs/specs/<slug>.md`. Preferred input. Plan inherits slug.
- **GH issue ref** — `#123`. Read with `gh issue view`. If no spec exists, ask via `AskUserQuestion` whether to run `/spec #123` first (recommended) or plan directly from the issue.
- **Free text** — treat as the seed. Strongly recommend running `/spec` first.
- **Empty** — ask which.

## Flow

1. **Load inputs.** Read the spec (or issue + recent comments). Read `CLAUDE.md` "Current decisions at a glance" if not already in context — most plans bump into an ADR.

2. **Spawn `planner` agent.** Pass: spec content, the constraint that it MUST emit a `RESEARCH_NEEDED` block for any unknown rather than guessing, and explicit instruction to flag every load-bearing decision (file boundaries, package scopes, ADR conflicts, schema diffs, migration ordering) as a numbered DECISION instead of resolving it.

3. **Resolve research gaps.** For each `RESEARCH_NEEDED`, spawn `researcher` agents in parallel (one per question) — short prompts, evidence-only. Feed results back to planner via `SendMessage`.

4. **Walk decisions with the user.** For EACH numbered DECISION the planner surfaces:
   - Pose via `AskUserQuestion` with 2–4 options, each with description and trade-off
   - Recommend one (the planner's pick) but never auto-accept
   - Pass the user's answer back to planner
   - Do this even for "obvious" decisions — past feedback: don't let the planner silently resolve trade-offs.
   - If >6 decisions surface, batch related ones into multi-question `AskUserQuestion` calls (max 4 per call).

5. **ADR check.** Before final draft, ask planner: "Does this conflict with any ADR in `adr/`?" If yes, surface to user via `AskUserQuestion`: adjust plan to conform, OR draft a superseding ADR first via `adr-writer` agent. Per `CLAUDE.md`, ADRs are immutable — never edit existing.

6. **PR shape decision.** Ask user via `AskUserQuestion`:
   - **Single PR** — small, single-package, no migrations
   - **Multi-PR phased** — large or cross-package; each phase gets its own worktree at execution time
   - **Spike + PR** — exploratory branch first, then real PR

   For multi-PR, planner must emit phases with: scope, exit bar, dependencies, suggested package scope(s) for Conventional Commit title.

7. **Screenshot decision.** Ask via `AskUserQuestion`: "Does this PR need screenshots?"
   - **Yes — required** (UI change, visible behavior shift) → record screenshot plan per phase: which screens, light+dark, mobile+portal as relevant. Per `CLAUDE.md`: commit images to PR branch under `docs/screenshots/<slug>/`, then post PR comment with branch-file links (NOT raw URLs, pasted attachments, or markdown tables — all three fail to render on mobile GH). Note in plan whether the screenshot commit gets squashed/dropped before merge.
   - **No — pure backend/refactor/docs** → record explicit "No screenshots — <reason>" in plan so reviewers don't ask.
   - **Maybe — depends on outcome** → defer to execution, flag in Open questions.

8. **Write the plan.** `docs/plans/<slug>.md`. If file exists, ask whether to overwrite or pick new slug. Template below.

9. **Critique offer.** Print path + one-line summary. Offer via `AskUserQuestion`: "Run `/critique docs/plans/<slug>.md` now?" Default yes — fresh devil's-advocate pass before execution.

## Plan template

```markdown
# <Working title>

**Status:** Draft
**Date:** <YYYY-MM-DD>
**Source spec:** <docs/specs/<slug>.md or issue link>
**Shape:** Single PR | Multi-PR (N phases) | Spike + PR

## Summary

<2–3 sentences. What ships, for whom, why now.>

## Approach

<The chosen design at architecture level. File boundaries, data flow, key types. Reference ADRs by number.>

## ADR impact

- <ADR-XXXX: conforms / superseded by new ADR / no touch>

## Decisions resolved

<Numbered list of every decision walked with the user. Each: question, options considered, chosen, why.>

## Phases

### Phase 1 — <name>

- **Scope:** <files/packages touched>
- **Exit bar:** <observable state when this phase is mergeable>
- **PR title scope:** `feat(client,shared): ...` (or whichever)
- **Worktree:** `pnpm worktree:add <slug>-phase-1 main` at execution time
- **Depends on:** none

### Phase 2 — <name>

<same shape>

## Open questions

<Anything the user deferred or that needs runtime verification.>

## Verification plan

- <type/lint/build/test commands per phase>
- <UI smoke or e2e additions>

## Screenshots

**Required:** Yes | No | Maybe (defer)

<If Yes:>
- Screens: <which views/states>
- Variants: <light+dark, mobile+portal>
- Path: `docs/screenshots/<slug>/`
- Delivery: PR comment with branch-file links (https://github.com/<owner>/<repo>/blob/<branch>/docs/screenshots/<slug>/<file>.png)
- Merge handling: squash/drop screenshot commit before merge? <yes/no>

<If No:>
- Reason: <pure backend / refactor / docs / etc.>

## References

- <spec, ADRs, related plans, issue>
```

## Rules

- **You do NOT write code.** Planner doesn't either. Code happens in execution, after `/critique`.
- **Verify every load-bearing decision with the user.** This is hard-rule from feedback memory. Even when planner is confident, surface the trade-off.
- **Plan lives in the repo, not in agent scratch.** Persist multi-PR plans at `docs/plans/<topic>.md` — execution phases reference the file.
- **Convert relative dates to absolute** before writing.
- **Run `git fetch origin` before any worktree advice** — stale local main is a known footgun (CLAUDE.md).
- **PR title scope is required and comma-separated** for multi-package — verify the listed scope covers every directory the phase touches.
- **No telemetry** in verification — observable UX or test assertions only (ADR-0028).
- **One spec = one plan = one shippable change** (possibly across N phases). If scope balloons mid-interview, propose splitting into a second spec.

## Visual context

When the spec or issue touches client/UI (paths under `packages/client/**`; keywords "UI", "screen", "visual", "theme", "layout"), pull the relevant canonical screenshots before drafting the plan. They live on `main` under `docs/screenshots/latest/` (symlink to newest `sha-<short>` dir, maintained by `.github/workflows/screenshots-main.yml`):

```
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<scene>.png?raw=true
```

Quote 1–3 raw URLs near the plan's "Approach" section as the visual anchor for the change. Do not wrap in markdown image tags. In Phase 4 of the screenshot harness rollout, also write `.screenshot-tags` (repo root, gitignored) with a Playwright `--grep` regex matching the tags whose scenes the change is likely to affect, so the pre-push hook narrows capture to those subsets.
