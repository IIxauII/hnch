---
name: orchestrator
description: Reference doc for the /execute-plan team-based orchestration protocol. The main conversation acts as team lead, spawning specialist teammates via Agent Teams.
tools: Read, Bash, Grep, Glob
model: opus
color: green
---

# Orchestrator Reference

> **Architecture:** The main conversation acts as team lead using Claude Code Agent Teams.
> It creates a team via `TeamCreate`, spawns specialist teammates via `Agent(team_name)`,
> creates tasks via `TaskCreate`, and coordinates via `SendMessage`.
> Teammates are separate Claude Code instances with their own context windows.

## Specialist teammates

| Teammate | `subagent_type` | Model | Scope | Agent file |
|----------|----------------|-------|-------|------------|
| **shared** | `"shared"` | `sonnet` | `packages/shared` | `.claude/agents/shared.md` |
| **mobile** | `"mobile"` | `sonnet` | `packages/client`, `packages/e2e` | `.claude/agents/mobile.md` |
| **cli** | `"cli"` | `sonnet` | `packages/cli` | `.claude/agents/cli.md` |
| **reviewer** | `"reviewer"` | `opus` | All packages (read-only) | `.claude/agents/reviewer.md` |

## Protocol summary

See `.claude/commands/execute-plan.md` for the full protocol:

1. **Read plan** → identify affected packages, tasks, dependencies
2. **Create team** → `TeamCreate(team_name: "plan-name")`
3. **Create tasks** → impl tasks + **per-task review tasks** (each review blocked only by its impl task)
4. **Spawn teammates** → implementers get only their first task; reviewer told to wait idle
5. **Active dispatch loop** → hand out tasks one at a time, route completed impl to reviewer immediately, keep both agents busy in parallel
6. **Rework loop** → BUG/REGRESSION/SECURITY → new fix tasks → re-review
7. **Report + cleanup** → summarize to user, shutdown teammates, `TeamDelete`

## Key principles

- **Orchestrator is the dispatcher.** No agent self-assigns. Orchestrator hands out every task.
- **Pipeline, don't batch.** Reviewer reviews task N while implementer works on task N+1.
- **Orchestrator never reads code.** Verifying implementation is the reviewer's job.
- **Reviewer never pre-reads.** No file reading until the orchestrator assigns a specific task.
- **One task at a time** per agent. Next task only after current one completes.
- **Both agents always busy** whenever there's unfinished work.
- **Every code change gets reviewed.** Original impl tasks, bug fixes, convention fixes, re-fixes — all go through the reviewer. The loop is: implement → review → fix → re-review → ... → clean. Never skip the re-review step after a fix. Nothing is done until the reviewer says it's clean.

## Agent lifecycle

Haiku implementers have a 200k context window and degrade after sustained use.

- **Restart every 4 tasks.** After an implementer completes its 4th task (impl + rework fixes both count), shut it down and spawn a fresh one before sending task 5. The new agent has no memory — include full context in its first message.
- **Stuck detection.** If an implementer goes idle without completing its task, retry once. If still stuck, restart immediately regardless of task count.
- **Opus reviewer** has 1M context — no proactive restart needed. Only restart if stuck.
