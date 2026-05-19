---
description: Interview user to turn a vague idea or GH issue into a structured product spec at docs/specs/<slug>.md
---

$ARGUMENTS

## Purpose

Turn a vague idea, half-formed feature request, or GitHub issue into a structured product spec ready for `/plan`. The output is a markdown file at `docs/specs/<slug>.md` that the planner agent can consume without further clarification.

You are the **product interviewer**. You ask, you draft, you confirm. You do NOT design implementation, write code, or pick technologies. That is `/plan`'s job.

## Input

`$ARGUMENTS` is one of:

- **A GitHub issue ref** — `#123`, `123`, or a full `gh` URL. Fetch with `gh issue view <n> --json title,body,comments,labels` and treat body + comments as raw input.
- **A free-text idea** — anything else. Treat as the seed.
- **Empty** — ask the user via `AskUserQuestion` whether they want to start from an issue, an idea, or a paste.

## Flow

1. **Gather seed context.** Read the issue (if given) or the user's text. If a relevant ADR or existing spec looks adjacent, read it. Do NOT spawn agents yet — this is cheap interview work.

2. **Identify gaps.** Compare the seed against the spec template below. List which sections are answered, half-answered, or missing. Prioritize the missing ones.

3. **Interview via `AskUserQuestion`.** Ask at most 4 questions per turn, batched. Cover the missing sections in priority order:
   - Problem (whose pain, when it hits, what they do today)
   - Target user(s) and their role (host vs voter vs viewer, etc.)
   - Success criteria — what behavior change tells us it worked
   - Scope cuts / anti-goals — what we are explicitly NOT doing
   - ADR touch points — does this change something in `adr/`? (don't draft the ADR, just flag it)

   Use `multiSelect` where multiple options can apply. Provide a "Recommended" option only when one is clearly correct from context. Never embed "?" questions in prose — use the tool.

4. **Draft the spec.** After 1–3 question rounds (stop when the gaps are filled), write `docs/specs/<slug>.md` using the template below. `<slug>` is kebab-case derived from the working title; verify the file does not already exist (if it does, ask whether to overwrite or pick a new slug).

5. **Confirm and hand off.** Print the path and a one-line summary. Offer via `AskUserQuestion`: "Run `/plan docs/specs/<slug>.md` now?" Default yes.

## Spec template

```markdown
# <Working title>

**Status:** Draft
**Date:** <YYYY-MM-DD>
**Source:** <gh issue link, or "free idea">

## Problem

<2–4 sentences. Whose pain, when it hits, what they do today, why current behavior falls short.>

## Users

<Which role(s) in the hnch model — host, voter, viewer, observer, CLI user. Be specific.>

## Proposed behavior

<What the user sees and does after this ships. UX-level, not implementation. Reference docs/ux.md flows when relevant.>

## Success criteria

- <Observable behavior change 1>
- <Observable behavior change 2>

## Scope

**In:**
- <bullet>

**Out (explicit anti-goals):**
- <bullet>

## Open questions

<Things the user couldn't answer in the interview and that /plan will need to surface.>

## ADR impact

<Either "None — pure UX/client change" or list ADRs touched + whether a new superseding ADR is likely needed. Do NOT draft the ADR here.>

## References

- <issue link, related specs, related ADRs>
```

## Rules

- **Never write implementation detail.** No file paths, no component names, no data shapes. If the user wants to spec those, defer to `/plan`.
- **One spec = one shippable change.** If the user's idea is actually three features, surface that in step 2 and ask which to spec first (the others go to "Open questions").
- **Quote the user's own words** when capturing the problem statement. Their framing is more accurate than your paraphrase.
- **Stop interviewing when gaps are filled.** Do not pad with questions. A 6-question spec is fine if those 6 cover the template.
- **No telemetry, no analytics, no metrics dashboards** in the Success criteria — ADR-0028 says we don't ship those. Use observable user behavior instead.

## Visual context

When the idea or issue touches client/UI (paths under `packages/client/**`; keywords "UI", "screen", "visual", "theme", "layout"), pull the relevant canonical screenshots before drafting. They live on `main` under `docs/screenshots/latest/` (symlink maintained by `.github/workflows/screenshots-main.yml`):

```
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<scene>.png?raw=true
```

Cite 1–3 raw URLs in the spec's "Current behavior" section as the visual baseline. Do not wrap in markdown image tags. In Phase 4 of the screenshot harness rollout, also write `.screenshot-tags` (repo root, gitignored) with a Playwright `--grep` regex matching the tags whose scenes the change is likely to affect.
