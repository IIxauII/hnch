Refine and plan: $ARGUMENTS

## Instructions

You are a collaborative planning partner. Your job is to understand the request, research, draft a plan, and surface only the decisions that genuinely need user input. The output is a plan file in `plans/` ready for `/execute-plan`.

### Phase 0: Clarify (only if needed)

If the request is ambiguous or you lack enough context to even begin research, ask clarifying questions FIRST. Don't research blindly — a wrong assumption wastes more time than a quick question.

Skip this phase if the request is clear enough to start exploring.

### Phase 1: Silent research

1. Read relevant project docs (`roadmap.md`, `project.md`, `ux.md`, `schema.md`, ADRs) to understand current state
2. Explore codebase areas related to the topic — read key files, understand existing patterns
3. Form your own understanding of scope, approach, and decisions

**Do NOT ask the user questions during this phase.** You are gathering context, not interviewing.

### Phase 2: Present draft plan with decision points

Present a single cohesive draft covering:

- **Context** — what and why (2-3 sentences)
- **User journey** — numbered steps (happy path + key error/edge states)
- **Decision points** — ONLY decisions where multiple valid paths exist AND user preference matters. For each:
  ```
  **D1: <question>**
  A) Option one — brief tradeoff ← recommended (if you have one)
  B) Option two — brief tradeoff
  Pick: ___
  ```
- **Tasks** — numbered, with files + intent (not line-level implementation detail)

**Decisions you make yourself (no question to user):**
- Anything dictated by existing patterns, conventions, or ADRs
- Implementation details (method names, signal types, file structure matching existing code)
- Obvious technical choices with one clearly superior path

**Decisions you surface to user:**
- Genuine UX/product tradeoffs (e.g., modal vs inline, auto vs manual trigger)
- Architecture choices with real tradeoffs (e.g., new service vs extending existing)
- Scope boundaries (include feature X in this plan or defer?)
- Anything that conflicts with or isn't covered by existing ADRs

**Scale with complexity.** A simple bug fix might have zero decision points and 2 tasks. A new feature might have 4 decisions and 10 tasks. A cross-cutting refactor might need several rounds of discussion. Match the depth to the work.

### Phase 3: Estimation

After the plan draft is aligned (decisions resolved, tasks agreed), do a story point estimation round:

1. Present your estimate for the overall plan with brief reasoning (use the project's own scale if one is active, otherwise Fibonacci: 1, 2, 3, 5, 8, 13)
2. Ask the user for their estimate
3. Compare:
   - **Match or adjacent** (e.g., 5 vs 5, 5 vs 8) — note it and move on
   - **Gap of 2+ steps** (e.g., 3 vs 8) — discuss. The gap reveals a scope misunderstanding. Clarify what each side is counting/expecting, adjust plan if needed, re-estimate

The agreed estimate goes into the final plan file.

### Phase 4: Finalize

User picks options, adjusts tasks, adds/removes scope. This may take one round or several depending on complexity — follow the user's lead.

When aligned, write the plan to `plans/plan-<slug>.md` using this format:

```markdown
# Plan: <title>

**Estimate:** <agreed story points>

## Context

<What and why — the problem/need, what prompted it, intended outcome>

## User Journey

<Numbered steps: end-to-end user experience including edge cases>

## UX / UI

<Per-screen breakdown if applicable: what changes, states, platform differences>
<Omit this section for backend-only or type-only changes>

## Decisions

<Numbered list of each decision made, with the chosen answer>

## Acceptance Criteria

- [ ] Criterion one
- [ ] Criterion two
- [ ] ...

## Tasks

- [ ] **T1: <title>**
  - File(s): `path/to/file`
  - What: <behavior to add/change>
  - AC: <which acceptance criteria this covers>

- [ ] **TN: Build + verify**
  - `pnpm build` passes
  - Manual test steps

## Key Files Reference

<Paths to files the implementer will need to read>
```

Tell the user the plan file path and that they can run `/execute-plan plans/plan-<slug>.md` when ready.

## Rules

1. If you don't have enough info to research effectively, ask first (Phase 0). Otherwise research silently.
2. Default on obvious decisions — only surface genuine tradeoffs.
3. Present options (2-4) with recommendations, not open-ended questions.
4. Scale depth with complexity — don't over-plan simple things or under-plan complex ones.
5. Always do an estimation round — don't skip it. Gaps reveal scope misunderstandings.
6. Read relevant code before proposing anything — don't plan against assumptions.
7. If a decision requires a new ADR, note it in the Decisions section.
8. Track all decisions, AC, and tasks — the final plan file must reflect everything agreed.
9. Save final plan to `plans/plan-<slug>.md` (create `plans/` dir if needed).
