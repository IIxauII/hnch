# Execute: E2E Test Suite Plan

You are an **orchestrator** executing the implementation plan at `docs/superpowers/plans/2026-04-22-e2e-test-suite.md`. Read that plan now — it is your source of truth for every task.

## Agent Roles

You coordinate two specialist agents:

1. **Implementor** — writes code, runs commands, creates commits. Spawned via `Agent` tool.
2. **Reviewer** — reviews the implementor's output against the plan. Spawned via `Agent` tool with `subagent_type: "superpowers:code-reviewer"`.

You (the orchestrator) never write code yourself. You dispatch, wait, relay, and decide.

## Execution Rules

### Sequential task execution
- Work through the plan's tasks **one at a time**, in order.
- The implementor **cannot start Task N+1** until the reviewer has **approved** Task N.
- If the reviewer flags issues, send the implementor back to fix them before moving on.

### Task lifecycle
For each task:

1. **Announce** — tell the user which task you're starting (e.g. "Starting Task 3: Session Creation test").
2. **Dispatch implementor** — spawn an Agent with a prompt that includes:
   - The full task description copied from the plan (steps, file paths, code blocks, verification commands).
   - Any context from earlier tasks the implementor needs (e.g. "Task 1 scaffold is already committed, helpers.ts already exists at packages/e2e/tests/fixtures/helpers.ts").
   - Explicit instruction to commit on success per the plan's commit step.
3. **Wait for implementor** — do not proceed until the implementor returns.
4. **Dispatch reviewer** — spawn a code-reviewer Agent with a prompt that includes:
   - Which task was just implemented and what files were created/modified.
   - The acceptance criteria: does the code match the plan? Did verification commands pass? Was a commit made?
   - Instruction to report PASS or FAIL with specific issues.
5. **Wait for reviewer** — do not proceed until the reviewer returns.
6. **Evaluate** — if PASS, mark the task done and move to the next. If FAIL, send the implementor back with the reviewer's feedback, then re-review. Repeat until PASS.

### Current state
Task 1 (scaffold) is **already committed** (`c50b6f1`). `packages/e2e/tests/fixtures/helpers.ts` already exists on disk but is **not committed** — it was started as part of Task 2. Begin execution from **Task 2**.

### Implementor prompt template

When spawning the implementor, use this structure:

```
You are implementing Task {N} of the hnch e2e test suite plan.

## Context
- Working directory: /Users/xau/Documents/projects/hnch
- Package: packages/e2e
- Prior tasks 1–{N-1} are committed.
- {any additional context, e.g. "helpers.ts already exists"}

## Task {N}: {title}
{paste the full task section from the plan, including all steps, code blocks, and verification commands}

## Instructions
- Follow the plan exactly. Do not improvise beyond what the plan specifies.
- Create/modify only the files listed in the task.
- Run every verification command listed and confirm it passes.
- If a verification fails, diagnose and fix before proceeding.
- Commit exactly as the plan specifies (message, files staged).
- Report back: which files were created/modified, verification results, commit hash.
```

### Reviewer prompt template

When spawning the reviewer, use this structure:

```
Review the implementation of Task {N} ("{title}") from the hnch e2e test suite plan.

## What was implemented
{summary from the implementor's report: files created, verification results, commit hash}

## Plan reference
{paste the relevant task section from the plan}

## Review checklist
1. Do the created/modified files match what the plan specifies?
2. Does the code match the plan's code blocks (allowing minor adjustments for real-world issues)?
3. Did all verification commands pass?
4. Was a commit made with the correct message and staged files?
5. Are there any bugs, typos, or deviations that would cause failures in later tasks?

Report: PASS or FAIL. If FAIL, list specific issues that must be fixed.
```

### Completion
After all 13 tasks pass review, run the full suite (`pnpm test:e2e`) one final time via an implementor agent, then report the overall result to the user.

## Begin
Read the plan now, then start with Task 2.
