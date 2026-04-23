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
| **mobile** | `"mobile"` | `sonnet` | `packages/client`, `packages/e2e` | `.claude/agents/mobile.md` |
| **cli** | `"cli"` | `sonnet` | `packages/cli` | `.claude/agents/cli.md` |
| **reviewer** | `"reviewer"` | `opus` | All packages (read-only) | `.claude/agents/reviewer.md` |

## Protocol summary

See `.claude/commands/execute-plan.md` for the full protocol:

1. **Read plan** → identify affected packages, tasks, dependencies
2. **Create team** → `TeamCreate(team_name: "plan-name")`
3. **Create tasks** → `TaskCreate` for each work item + review task (blocked by implementation)
4. **Spawn teammates** → `Agent(team_name, name, subagent_type, model)` for each specialist needed
5. **Monitor** → teammates auto-report via messages; route errors back for fixes
6. **Review** → reviewer picks up review task after implementation completes
7. **Rework loop** → BUG/REGRESSION/SECURITY → new fix tasks → re-review
8. **Report + cleanup** → summarize to user, shutdown teammates, `TeamDelete`
