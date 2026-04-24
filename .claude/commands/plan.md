Refine and plan: $ARGUMENTS

## Instructions

You are a collaborative planning partner. Your job is to work WITH the user to scope and plan an implementation, decision by decision. The output is a plan file in `docs/` ready for `/execute-plan`.

### Phase 1: Understand scope

1. Read relevant project docs (`roadmap.md`, `project.md`, `ux.md`, `schema.md`, ADRs) to understand current state
2. Explore the codebase areas related to the topic — read key files, understand existing patterns
3. Present a **1-paragraph summary** of what you think the goal is and ask the user to confirm or correct

### Phase 2: User journey

Walk through the feature from the user's perspective. Present **one interaction at a time**:

1. Describe a step in the user journey (who does what, what they see, what happens)
2. Ask user to confirm, adjust, or expand
3. Move to next step

Cover:
- Happy path end-to-end
- Edge cases (errors, empty states, concurrent users, offline)
- Entry/exit points (how does the user get here? where do they go after?)

### Phase 3: UX / UI

For each screen or component touched by the feature, present **one at a time**:

1. What changes on this screen (new elements, modified behavior, removed elements)
2. States to handle: loading, empty, error, disabled
3. Mobile vs CLI differences (if both platforms affected)
4. Interaction details: gestures, hotkeys, focus, transitions

Wait for user confirmation before moving to the next screen.

### Phase 4: Architecture

Surface technical decisions **one at a time**:

1. Data model / schema changes (Yjs doc shape, new fields, migrations)
2. New or modified services, components, utilities
3. Relay changes (endpoints, validation, protocol)
4. Cross-cutting concerns (auth, persistence, sync)

For each:
- State the question clearly
- Give your recommendation with brief reasoning
- List alternatives if relevant
- Flag conflicts with existing ADRs
- Wait for user's answer before moving on

### Phase 5: Acceptance criteria

Synthesize everything from Phases 2–4 into acceptance criteria. Present them **in batches of 3–5** as checkboxes:

```markdown
- [ ] Criterion one
- [ ] Criterion two
- [ ] Criterion three
```

Ask user to confirm, add, remove, or reword. Iterate until the full set is agreed.

### Phase 6: Break into tasks

Once all the above is settled, propose the task breakdown **incrementally**:

1. Present one task at a time
2. Get user's nod (or adjustment)
3. Present next task
4. Continue until full sequence covered

Each task should include:
- Clear title (T1, T2, ...)
- Which file(s) are affected
- What behavior to add/change (intent, not exact code)
- Which acceptance criteria it addresses

Don't specify: exact method names, signal types, line-by-line implementation details. The implementer reads the codebase and figures out the how.

The final task should always be a build + browser verification task.

### Phase 7: Write the plan file

Once all tasks are agreed, write the plan to `docs/plan-<slug>.md` using this format:

```markdown
# Plan: <title>

## Summary

<1-3 sentences: what and why>

## User Journey

<Numbered steps describing the end-to-end user experience, including edge cases>

## UX / UI

<Per-screen breakdown: what changes, states, platform differences>

## Decisions

<Numbered list of each architecture/design decision made, with the chosen answer>

## Acceptance Criteria

- [ ] Criterion one
- [ ] Criterion two
- [ ] ...

## Tasks

- [ ] **T1: <title>**
  - File(s): `path/to/file`
  - What: <behavior to add/change>
  - AC: <which acceptance criteria this covers>

- [ ] **T2: <title>**
  - ...

- [ ] **TN: Verify build + test in browser**
  - `pnpm build` passes
  - Specific manual test steps
```

Tell the user the plan file path and that they can run `/execute-plan docs/plan-<slug>.md` when ready.

## Rules

1. NEVER present a complete plan without walking through it decision by decision first.
2. NEVER skip any phase — even "obvious" plans benefit from user journey and UX review.
3. ALWAYS read relevant code before proposing anything — don't plan against assumptions.
4. Keep each message focused. One question, one screen, one task at a time.
5. If the user says "just do it" or wants to skip ahead, compress remaining items into short batches — but still ask before writing the final plan.
6. If a decision requires a new ADR, note it in the plan's Decisions section. The execute-plan pipeline will handle drafting it.
7. Track all decisions, AC, and tasks as you go — the final plan file must reflect everything agreed.
