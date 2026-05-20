---
description: Devil's-advocate review of a spec or plan via plan-critic agent — surfaces missed scope, wrong abstractions, ADR conflicts, blind spots
---

$ARGUMENTS

## Purpose

Independent critical review of a `docs/specs/<slug>.md` or `docs/plans/<slug>.md` BEFORE execution. Output: a numbered challenge list, each with counterargument and suggested fix. Optionally fold accepted challenges back into the source file.

You are the **critique orchestrator**. The `plan-critic` agent does the read-only review; you frame the input, walk the user through challenges, and apply revisions.

## Input

`$ARGUMENTS` is one of:

- **Path to plan** — `docs/plans/<slug>.md`. Primary use case.
- **Path to spec** — `docs/specs/<slug>.md`. Product-level critique (problem framing, scope cuts, success criteria) rather than impl detail.
- **Empty or "latest"** — list both dirs newest-first via `ls -t`, ask via `AskUserQuestion` which to review.

## Flow

1. **Load target.** Read the file. Detect type (`specs/` vs `plans/`) from path — different critique lens.

2. **Pre-gather context.** If plan, also read the linked spec (header `**Source spec:**`). Read `CLAUDE.md` decisions list and any ADRs the doc explicitly cites. Do NOT read everything in `adr/` — only the ones referenced.

3. **Spawn `plan-critic` agent.** Read-only, opus. Pass:
   - Target file content
   - Linked spec (for plans)
   - Cited ADRs verbatim
   - Lens directive:
     - **Plan lens:** missed scope, wrong abstractions, ADR conflicts, dependency-chain errors, race/security blind spots, untested edge cases, alternative approaches the planner skipped, multi-scope commit coverage gaps
     - **Spec lens:** problem framing soundness, target user accuracy, success criteria observability (no telemetry — ADR-0028), scope cuts that actually cut, anti-goals that hold up, hidden cross-feature coupling
   - Output format: numbered list, each item with `Challenge:` / `Counterargument:` / `Suggested fix:`

4. **Surface challenges to user.** Print the full list as plan-critic returned it. Then walk **each challenge** via `AskUserQuestion`:
   - **Accept** — apply suggested fix to source file
   - **Reject** — note in source file under "Critique rejected" with one-line rationale (so re-review doesn't re-raise)
   - **Defer** — add to source file's "Open questions" section
   - **Discuss** — pause walk, user wants to talk it through

   Batch related challenges into multi-question `AskUserQuestion` calls (max 4 per call).

5. **Apply revisions.** For each Accepted challenge, edit the source file (`Edit` tool) to fold in the fix. For each Rejected, append a one-line note. Preserve existing structure — do NOT rewrite the file wholesale.

6. **Summary.** Print: N accepted, N rejected, N deferred. If any challenges touched an ADR conflict, surface explicitly — may need `adr-writer` follow-up.

7. **Re-run offer.** If ≥3 challenges were Accepted, offer via `AskUserQuestion`: "Re-run `/critique` after revisions?" Default no — single pass is usually enough; offer only when changes were substantive.

## Rules

- **plan-critic is read-only.** It MUST NOT write code, plans, or ADRs. Enforce by reading its output, not running its edits.
- **Never silently accept a challenge.** Every one walks through `AskUserQuestion`. Even "obvious" ones.
- **Reject ≠ ignore.** A rejected challenge gets a recorded rationale in the file. Future re-reviews see this and skip.
- **Do not invoke `/plan` from here** even if challenges suggest replanning. Print the recommendation, let the user trigger.
- **ADR conflicts are escalation triggers.** If plan-critic flags one, do not auto-accept the "ignore" path. Surface to user with the option to draft a superseding ADR via `adr-writer` before proceeding.
- **Critique is not code review.** For diff review on a PR, use `/review` or `/code-review` skills — those exist already. `/critique` is pre-execution.
- **Single-pass discipline.** Resist running plan-critic twice on the same unchanged file. If user wants a second opinion, spawn a SECOND parallel critic with a different lens (e.g., security-reviewer) rather than re-querying plan-critic.

## Visual context

When critiquing a UI-touching spec/plan (paths under `packages/client/**`; keywords "UI", "screen", "visual", "theme", "layout"), read the canonical screenshots before flagging gaps. They live on `main` under `docs/screenshots/latest/` (symlink maintained by `.github/workflows/screenshots-main.yml`):

```
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<scene>.png?raw=true
```

Use them to verify the spec/plan's claims about current behavior match reality, and to spot scenes the change touches but the spec/plan doesn't mention.

**Also read `.screenshot-tags`** (repo root, gitignored) if present. It is a Playwright `--grep` regex written by `/plan` or `/spec` to scope the pre-push capture. Tag catalog + per-tag file map: `packages/e2e/README.md → Tag catalog`. If the listed tags miss obviously-affected surfaces (e.g. plan touches participant rosters but `.screenshot-tags` only lists `@theming`), surface that as a critique under "missed scope". If the file is absent on a UI plan, the hook will run the full suite — usually fine, but flag if the diff is small enough that scoping would speed up review cycles.
