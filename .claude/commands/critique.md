---
description: Devil's-advocate review of a spec or plan issue via plan-critic agent — surfaces missed scope, wrong abstractions, ADR conflicts, blind spots
---

$ARGUMENTS

## Purpose

Independent critical review of a spec or plan BEFORE execution. Specs and plans live in GitHub issues (published by the `to-spec` and `to-tickets` skills), never in repo files. Output: a numbered challenge list, each with counterargument and suggested fix. Accepted challenges are folded back into the issue.

You are the **critique orchestrator**. The `plan-critic` agent does the read-only review; you frame the input, walk the user through challenges, and apply revisions.

## Input

`$ARGUMENTS` is one of:

- **Issue number or URL** — `581` or `https://github.com/IIxauII/hnch/issues/581`. Primary use case.
- **Empty or "latest"** — list open issues labelled `ready-for-agent` or `needs-triage`, newest-first (`gh issue list --state open --json number,title,labels,updatedAt --jq '[.[] | select(.labels[].name | IN("ready-for-agent","needs-triage"))] | sort_by(.updatedAt) | reverse'`), ask via `AskUserQuestion` which to review.

## Flow

1. **Load target.** `gh issue view <n> --json number,title,body,labels,comments`. Read the body and every comment: triage decisions and later comments often amend the body. Detect type from the content — a product spec (problem statement, user stories, success criteria) gets the spec lens; an implementation plan (phases, tasks, acceptance criteria per task) gets the plan lens; most issues carry both, so run both.

2. **Pre-gather context.** Follow links to parent or sibling issues the body cites (`gh issue view` each). Read `CLAUDE.md` decisions list and any ADRs the issue explicitly cites. Do NOT read everything in `adr/` — only the ones referenced.

3. **Spawn `plan-critic` agent.** Read-only, opus. Pass:
   - Issue number, title, body and comments verbatim
   - Linked parent/sibling issue bodies
   - Cited ADRs verbatim
   - Lens directive:
     - **Plan lens:** missed scope, wrong abstractions, ADR conflicts, dependency-chain errors, race/security blind spots, untested edge cases, alternative approaches the planner skipped, multi-scope commit coverage gaps
     - **Spec lens:** problem framing soundness, target user accuracy, success criteria observability (no telemetry — ADR-0028), scope cuts that actually cut, anti-goals that hold up, hidden cross-feature coupling
   - Output format: numbered list, each item with `Challenge:` / `Counterargument:` / `Suggested fix:`

4. **Surface challenges to user.** Print the full list as plan-critic returned it. Then walk **each challenge** via `AskUserQuestion`:
   - **Accept** — fold the suggested fix into the issue
   - **Reject** — record under a "Critique rejected" heading with one-line rationale (so re-review doesn't re-raise)
   - **Defer** — add to the issue's "Open questions" section
   - **Discuss** — pause walk, user wants to talk it through

   Batch related challenges into multi-question `AskUserQuestion` calls (max 4 per call).

5. **Apply revisions.** Post ONE comment on the issue (`gh issue comment <n> --body-file <tmp>`) with the accepted fixes, the rejected challenges with rationale, and the deferred questions, headed `## Critique <date>`. Edit the body (`gh issue edit <n> --body-file <tmp>`) only for accepted fixes that change acceptance criteria or scope; preserve the existing structure — do NOT rewrite the body wholesale.

6. **Summary.** Print: N accepted, N rejected, N deferred. If any challenges touched an ADR conflict, surface explicitly — may need `adr-writer` follow-up.

7. **Re-run offer.** If ≥3 challenges were Accepted, offer via `AskUserQuestion`: "Re-run `/critique` after revisions?" Default no — single pass is usually enough; offer only when changes were substantive.

## Rules

- **plan-critic is read-only.** It MUST NOT write code, issues, or ADRs. Enforce by reading its output, not running its edits.
- **Never silently accept a challenge.** Every one walks through `AskUserQuestion`. Even "obvious" ones.
- **Reject ≠ ignore.** A rejected challenge gets a recorded rationale on the issue. Future re-reviews see this and skip.
- **Do not re-plan from here** even if challenges suggest it. Print the recommendation; the user runs `to-spec` or `to-tickets` again.
- **ADR conflicts are escalation triggers.** If plan-critic flags one, do not auto-accept the "ignore" path. Surface to user with the option to draft a superseding ADR via `adr-writer` before proceeding.
- **Critique is not code review.** For diff review on a PR, use `/review` or `/code-review` skills — those exist already. `/critique` is pre-execution.
- **Single-pass discipline.** Resist running plan-critic twice on the same unchanged issue. If user wants a second opinion, spawn a SECOND parallel critic with a different lens (e.g., security-reviewer) rather than re-querying plan-critic.
- **No AI attribution** in anything posted to the issue.

## Visual context

When critiquing a UI-touching issue (paths under `packages/client/**`; keywords "UI", "screen", "visual", "theme", "layout"), read the canonical screenshots before flagging gaps. They live on the `screenshots` branch under `latest/<topic>/` (main's newest reference set, published by main's CI run; `latest.json` beside it names the `main` commit it shows):

```
https://github.com/IIxauII/hnch/blob/screenshots/latest/<topic>/<scene>.png?raw=true
```

Use them to verify the issue's claims about current behavior match reality, and to spot scenes the change touches but the issue doesn't mention.

**Screenshot scope.** The pre-push hook captures the full screenshot suite unless the worktree holds a `.screenshot-tags` regex (`pnpm worktree:add <name> [base] --tags "<grep>"`; catalog in `packages/e2e/README.md → Tag catalog`). If the issue proposes a tag scope that misses obviously affected surfaces (e.g. it touches participant rosters but names only `@theming`), surface that as a critique under "missed scope". Do not write `.screenshot-tags` during critique.
