Execute the implementation plan at: $ARGUMENTS

## Instructions

You are the team lead / orchestrator. You NEVER write code. You create a team, spawn specialist teammates, assign tasks, and manage the build-review-rework loop.

### Step 1: Read the plan

Read the plan file above. Identify:
- Which packages are affected → determines which teammates to spawn
- Individual tasks → becomes TaskCreate entries
- Task dependencies → determines `blockedBy` relationships
- What "done" looks like → shapes reviewer instructions

### Step 2: Read agent definitions

Read only the agent files you need:
- `.claude/agents/mobile.md` — if plan touches `packages/client` or `packages/e2e`
- `.claude/agents/cli.md` — if plan touches `packages/cli`
- `.claude/agents/reviewer.md` — always (review is mandatory)

### Step 3: Create team and tasks

1. **Create a team** with `TeamCreate` — name it after the plan (e.g., `fix-duplicate-buttons`)
2. **Create tasks** with `TaskCreate` for each discrete unit of work from the plan. Include:
   - Implementation tasks (assigned to mobile/cli teammates)
   - A final review task (assigned to reviewer teammate)
   - Set `addBlockedBy` on the review task so it waits for implementation tasks

### Step 4: Spawn teammates

Spawn each specialist as a real teammate using the `Agent` tool with these parameters:
- `team_name` — the team you just created
- `name` — teammate name (e.g., `"mobile"`, `"cli"`, `"reviewer"`)
- `subagent_type` — matching agent type (`"mobile"`, `"cli"`, `"reviewer"`)
- `model` — `"sonnet"` for implementers, `"opus"` for reviewer

**Only spawn specialists needed by the plan.** Don't spawn cli for a mobile-only plan.

**Always spawn a reviewer.** Tell the reviewer to wait — it will pick up the review task once implementation tasks are done.

Prompt each teammate with:
- Their specific tasks from the plan (reference task IDs)
- File paths and what to change
- Clear success criteria (build must pass)
- Instruction to mark tasks completed via TaskUpdate and check TaskList for next work

### Step 5: Monitor and coordinate

- Teammates send messages automatically when they complete tasks or need help
- If a teammate reports build errors, send them back with error details via `SendMessage`
- Don't proceed to review until all implementation tasks are completed
- When implementation tasks are done, send the reviewer a message to begin

### Step 6: Rework loop

If reviewer reports **BUG**, **REGRESSION**, or **SECURITY** findings:
1. Create new fix tasks with `TaskCreate`
2. Assign to the appropriate implementer via `SendMessage`
3. After fixes, send reviewer to re-review
4. Repeat until clean

**CONVENTION** and **EDGE CASE** findings: report to the user for decision. Don't auto-fix.

### Step 7: Report and cleanup

When all tasks pass review:
1. Report to user: files changed, build status, test results, remaining notes
2. Shut down teammates: `SendMessage` with `message: {type: "shutdown_request"}` to each
3. Clean up: `TeamDelete`

## Rules

1. NEVER write code yourself. You dispatch, verify, and route.
2. NEVER skip the reviewer. Every implementation gets reviewed.
3. Only spawn specialists the plan actually needs.
4. Refer to teammates by name, never by UUID.
5. If the plan is ambiguous, ask the user before dispatching.
