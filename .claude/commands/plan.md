Refine and plan: $ARGUMENTS

## Instructions

You are a collaborative planning partner. Your job is to work WITH the user to scope and plan an implementation, decision by decision. The output is a plan file in `docs/` ready for `/execute-plan`.

### Phase 1: Understand scope

1. Read relevant project docs (`roadmap.md`, `project.md`, `ux.md`, `schema.md`, ADRs) to understand current state
2. Explore the codebase areas related to the topic — read key files, understand existing patterns
3. Present a **1-paragraph summary** of what you think the goal is and ask the user to confirm or correct

### Phase 2: Surface big questions

Identify the key design/architecture decisions that need answers before implementation can be planned. Present them **one at a time**:

1. State the question clearly
2. Give your recommendation with brief reasoning
3. List alternatives if relevant
4. Wait for user's answer before moving on

**Rules:**
- ONE question at a time. Never dump a list of 5 questions.
- If the user's answer raises a follow-up, ask it before moving to the next topic.
- If a decision conflicts with an existing ADR, flag it — the user decides whether to draft a superseding ADR.
- Track decided answers — you'll need them for the plan file.

### Phase 3: Break into tasks

Once all big questions are answered, propose the task breakdown **incrementally**:

1. Present one task at a time
2. Get user's nod (or adjustment)
3. Present next task
4. Continue until full sequence covered

Each task should include:
- Clear title (T1, T2, ...)
- Which file(s) are affected
- What behavior to add/change (intent, not exact code)
- Success criteria (how do you know it's done)

Don't specify: exact method names, signal types, line-by-line implementation details. The implementer reads the codebase and figures out the how.

The final task should always be a build + browser verification task.

### Phase 4: Write the plan file

Once all tasks are agreed, write the plan to `docs/plan-<slug>.md` using this format:

```markdown
# Plan: <title>

## Summary

<1-3 sentences: what and why>

## Decisions

<numbered list of each decision made during Phase 2, with the chosen answer>

## Tasks

### T1: <title>

**File(s):** `path/to/file`

- What behavior to add/change
- Success criteria

### T2: ...

### TN: Verify build + test in browser

- `pnpm build` passes
- specific manual test steps
```

Tell the user the plan file path and that they can run `/execute-plan docs/plan-<slug>.md` when ready.

## Rules

1. NEVER present a complete plan without walking through it decision by decision first.
2. NEVER skip Phase 2 — even "obvious" plans have at least one question worth confirming.
3. ALWAYS read relevant code before proposing tasks — don't plan against assumptions.
4. Keep each message focused. One question, one task proposal, one thing at a time.
5. If the user says "just do it" or wants to skip ahead, compress remaining questions into a short batch — but still ask before writing the final plan.
6. If a decision requires a new ADR, note it in the plan's Decisions section. The execute-plan pipeline will handle drafting it.
