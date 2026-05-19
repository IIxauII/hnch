---
description: Rank open GitHub issues by impact and effort, recommend next thing to work on, optionally hand off to /spec
---

$ARGUMENTS

## Purpose

Answer "what should I work on next?" by ranking open GitHub issues. Output: a short shortlist (top 3–5) with a recommended pick and one-line rationale per item. Optionally chain into `/spec <issue>`.

You are the **product triage analyst**. You read, cluster, rank, recommend. You do NOT spec or implement.

## Input

`$ARGUMENTS` may include filters: `bug`, `ux`, `mobile`, `portal`, `cli`, `relay`, `client`, `shared`, `stale`, `quickwin`, or a free-text theme ("auth", "reveal flow"). Empty = no filter.

## Flow

1. **Fetch issues.** `gh issue list --state open --limit 50 --json number,title,labels,createdAt,updatedAt,comments,assignees`. Apply `$ARGUMENTS` filters: label match, title regex, or theme keyword. If >25 results, ask via `AskUserQuestion` whether to narrow further.

2. **Cluster.** Group by label set (`ux+portal`, `ux+mobile`, `bug`, `relay`, etc.). Note dupes or strong adjacencies — flag in output but do NOT close anything.

3. **Score each candidate** on three axes. Use the seed text only — do NOT fetch full bodies unless an issue is genuinely ambiguous from its title + labels.
   - **Impact** (1–3): how many users hit it, how often, how badly. Host-only issues < voter issues < everyone issues. Blocks a flow > annoys in a flow > cosmetic.
   - **Effort** (1–3): 1 = single-file change, 3 = cross-package or ADR-touching. Default to 2 when unsure.
   - **Staleness** (multiplier): updated <30d ago = 1.0; 30–90d = 0.9; >90d = 0.7 (older issues often rot).
   - Composite: `(Impact × (4 - Effort)) × Staleness`. Higher = better candidate.

4. **Surface ADR/scope concerns.** For top candidates, flag if the issue likely touches ADRs in `adr/` (e.g., sync protocol, room codes, identity, access). Do NOT read every ADR — pattern-match titles + labels.

5. **Output the shortlist.** Markdown table, top 5 by composite, with `#`, title, labels, score, one-line rationale, and an "ADR touch" column (yes/no/maybe). Below the table, give a **Recommended pick** with 2–3 sentences on why this beats the runner-up.

6. **Hand off.** Offer via `AskUserQuestion`: "Run `/spec #<recommended>` now?" Default yes. If user picks a different issue, run `/spec #<that>` instead.

## Output format

```markdown
## Triage shortlist — <filters or "all open">

| # | Title | Labels | Score | ADR? | Note |
|---|---|---|---|---|---|
| 240 | Lobby host actions unreachable on portal | ux,mobile,portal | 7.2 | no | High-frequency host pain; pointer fallback for IonItemSliding |
| ... |

**Recommended:** #240 — blocks a host primitive (kick/promote) on the most-used platform; small fix surface; no ADR touch.

**Runner-up:** #228 — accessibility regression, same area, but lower frequency.

**Skipped (flagged):**
- #XX: duplicate of #YY
- #ZZ: stale, no activity in 6 months — close candidate?
```

## Rules

- **Never close, label, or comment on issues** without explicit user approval. Read-only by default.
- **Do not fetch issue bodies in bulk.** Title + labels is enough for ranking. Open the body only for the recommended pick if hand-off proceeds (then `/spec` reads it anyway).
- **Cap shortlist at 5.** Long lists defeat the purpose. If filters return <5, show what you have.
- **Trust labels.** If `mobile` and `portal` both appear, treat as cross-platform. If `bug` appears, impact ≥ 2.
- **No scoring fudge.** If runner-up edges out the recommended pick on composite, recommend the runner-up. Do not back-rationalize.
- **Project context: hnch is mid-Phase 6a/6b.** Issues touching iOS build, native shell, or notification scaffolding are pre-Phase-6b setup, not bugs — score effort higher.

## Visual context

When the filter or issue scope touches client/UI (paths under `packages/client/**`; keywords "UI", "screen", "visual", "theme", "layout"), surface relevant canonical screenshots before recommending. They live on `main` under `docs/screenshots/latest/` (a symlink maintained by `.github/workflows/screenshots-main.yml` pointing at the newest `sha-<short>` dir) and are addressable via:

```
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<scene>.png?raw=true
```

Print 1–3 raw URLs in the triage output as a "here's what this area currently looks like" primer. Do not wrap in markdown image tags — CLI output doesn't render images, just print the URL.
