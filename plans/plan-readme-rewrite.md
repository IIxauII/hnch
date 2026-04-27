# Plan: Rewrite root README.md

**Estimate:** 2 story points

## Context

Existing `/Users/xau/Documents/projects/hnch/README.md` (~85 LOC) is stale: lists only 3 packages (missing `cli`, `e2e`), still tells contributors to `ionic start` scaffold the client (already scaffolded), references `networking-analysis.md` (research artifact, fine to keep but not central), and predates the current 5-package monorepo + CLI parity contract (ADR-0021).

Goal: rewrite as a current orientation doc for a new visitor — what hnch is, stack, repo layout, run/test/build commands — derived from CLAUDE.md / project.md / roadmap.md. Hard cap **≤200 LOC**.

## User Journey

A new visitor lands on the GitHub repo:
1. Reads first paragraph → understands hnch is a planning-poker app, vowel-dropped name.
2. Skims Status → knows current phase (6a shipped, 6b iOS next).
3. Skims Stack table → knows it's Angular/Ionic/Capacitor + Node relay + Yjs.
4. Sees Repo Layout → understands 5 packages and their roles.
5. Hits Local Setup → knows Node 22+ / pnpm 9+, runs `pnpm install`, then `pnpm dev:client` / `pnpm dev:relay` / `pnpm dev:cli`.
6. Wants more depth → follows links to project.md, roadmap.md, schema.md, ADR index, CLAUDE.md.

Edge: visitor on npm/yarn — `preinstall` guard blocks them; README must mention pnpm-only and how to enable Corepack.

## Decisions

**D1: Writer agent for the root-level (non-`packages/`) README — needs user input**

Every haiku/sonnet implementer in `.claude/agents/` is package-scoped (`shared-haiku` says "exclusively in `packages/shared`", `mobile-haiku` says "`packages/client` only", etc.). No agent in the current roster has `README.md` (a root file) inside its allowed write surface. Plan-critic flagged this as a blocker — a haiku launched against `README.md` will likely refuse on its scope guard.

Options:
A) **Override `shared-haiku` scope for this single task only** — orchestrator instructs the writer to treat root markdown docs as in-scope for this brief. Cheapest path; relies on orchestrator-level instruction overriding the agent's own scope rule. ← **recommended**
B) Override `mobile-haiku` scope for this single task only — equivalent to A with a different writer; no advantage.
C) Permanently broaden one agent's allowed surface to include root markdown — touches the agent definition file, separate concern from this README rewrite.
D) Use `planner` or `adr-writer` agents — both write docs but neither is a general README writer; abuse of role.
E) User writes the README directly (no agent) — always available but defeats the workflow.

Going with A pending user confirmation. If user prefers C, that's a small follow-up plan that should land before this one.

**D2: Mention CLI package?**
A) Yes — list it in Repo Layout, add a `pnpm dev:cli` line in Everyday Commands ← **recommended**
B) No — CLI is ADR-0021 *Proposed*, not yet shipped

Going with A. CLI has a real `package.json`, root has a `dev:cli` script, and CLAUDE.md/project.md reference it as a shipping deliverable. Omitting it would leave the README stale on day one.

**D3: License section**
A) Omit License section entirely — no LICENSE file at root, none stated anywhere ← **recommended**
B) Add "License: TBD" placeholder
C) Surface to user — pick a license now

Going with A. Adding a TBD line is noise; a missing License section accurately reflects current state. User can request license addition as a follow-up.

**D4: Drop stale `ionic start` scaffolding section**
A) Drop entirely — `packages/client` is now real, scaffold is a one-time historical step ← **recommended**
B) Keep but rephrase as historical note

Going with A. README is for present-day visitors; historical scaffolding lives in git log.

**D5: Treatment of Proposed ADRs (uniform rule)**

ADR-0021 (CLI), ADR-0022, ADR-0023, ADR-0024, ADR-0025, ADR-0026, ADR-0027, and ADR-0028 are all Proposed. Plan-critic correctly noted that linking ADR-0027 inline while excluding ADR-0021 was incoherent.

A) **Do not link any Proposed ADR by number from the README.** For test-only env vars (`HNCH_ENABLE_TEST_ROUTES`, `HNCH_ROOM_CAP`), inline-explain in one sentence as "test-only; not for production deploys" without an ADR citation. CLI gets mentioned by name and `pnpm dev:cli`, no ADR number. ← **recommended**
B) Link Proposed ADRs with explicit "(Proposed)" annotation. More verbose; risks rot.

Going with A. Architecture-at-a-glance section may cite **only Accepted** ADRs (0001, 0002, 0003, 0008, 0009, 0010, 0012, 0014, 0016, 0017, 0018, 0019, 0020). All other ADRs are reachable via the linked `adr/README.md` index.

## Spec

### Behavioral Requirements

- Replace the file's contents in place at `/Users/xau/Documents/projects/hnch/README.md`.
- Final file is GitHub-Flavored Markdown, total LOC (including blanks and code fences) **≤ 200**.
- All relative links must resolve to existing files in the repo (verified by reviewer + verification story).
- **Markdown link form constraints (to keep verification simple):**
  - Inline-only links: `[text](path)` and `[text](path "title")`. The trailing ` "title"` form is allowed; verifier strips it.
  - **No anchor-only links** (`[x](#section)`). If a section reference is needed, prose-cite the section name without a link.
  - **No reference-style links** (`[x][ref]` + `[ref]: path`).
  - **No image links** (`![alt](path)`).
  - External `http://`, `https://`, `mailto:` URLs are allowed (not validated).
- No emojis. No badges (no CI badges yet to link to). No license section.
- Section order matches the outline below; section budgets are guidance, not rigid (within ±20%).

### Section Outline (target ~155 LOC, leaving headroom)

| # | Section | Approx LOC | Conveys |
|---|---|---|---|
| 1 | `# hnch` + 2-line tagline | 4 | One-line "what" + the vowel-drop name origin |
| 2 | `## Status` | 8 | Phase 6a shipped; mobile parity closed; next is Phase 6b iOS. Link to roadmap.md. Must contain literals `Phase 6a` and `Phase 6b` |
| 3 | `## Stack` (table) | 12 | Framework / UI / Native / State / Sync / Storage / Relay / Platforms — single table |
| 4 | `## Repo layout` (tree + bullets) | 22 | All 5 packages: `client`, `cli`, `relay`, `shared`, `e2e` — one-line each. Mentions `adr/`, `plans/`, top-level docs. Cite ADR-0014 (Accepted) |
| 5 | `## Prerequisites` | 14 | Node 22+, pnpm 9+ via Corepack snippet, no npm/yarn (preinstall guard). One line: "If you plan to run e2e tests, also run `pnpm exec playwright install` from `packages/e2e` once." |
| 6 | `## Setup` | 8 | `pnpm install` only; one-step. Drop the old `ionic start` block entirely |
| 7 | `## Everyday commands` (code fence) | 30 | `pnpm dev:client`, `pnpm dev:relay`, `pnpm dev:cli`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm typecheck`. Plus per-package `--filter` examples |
| 8 | `## Configuration` | 16 | Relay env vars: `PORT` defaults to `1234`. Client relay URL via `AppPreferenceService` runtime override (Preferences key `hnch.relayUrl`). One inline sentence: "Two test-only env vars (`HNCH_ENABLE_TEST_ROUTES`, `HNCH_ROOM_CAP`) exist for the e2e suite and must remain unset in production." No ADR-0027 link (Proposed; per D5) |
| 9 | `## Architecture at a glance` | 18 | 5–6 bullets: CRDT-over-relay, Yjs, ephemeral sessions, relay-enforced access, 24h snapshots, host election. **Cite only Accepted ADRs** (e.g., 0001, 0003, 0009, 0012, 0010). No Proposed ADRs |
| 10 | `## Documentation` | 12 | Bulleted list of pointers: `project.md`, `roadmap.md`, `schema.md`, `ux.md`, `cli.md`, `angular.md`, `ionic.md`, `adr/README.md`, `CLAUDE.md` |
| 11 | `## Contributing` | 10 | New ADR required for structural changes; ADRs immutable; do not add Co-Authored-By trailer (per repo convention); link `adr/README.md` |

Total estimate: ~154 LOC of content + section breaks → comfortably ≤200.

### Interfaces

N/A — pure documentation file. No code interfaces touched.

### Data Flow

N/A.

### Edge Cases

- **LOC overrun.** If draft exceeds 200 LOC, trim Architecture and Documentation sections first (most compressible). Never trim Prerequisites/Setup/Commands — those are load-bearing.
- **Broken relative link.** Reviewer must verify each link target exists. Required link targets (all confirmed present per research findings): `roadmap.md`, `project.md`, `schema.md`, `ux.md`, `cli.md`, `angular.md`, `ionic.md`, `adr/README.md`, `adr/0014-repo-layout-pnpm-workspaces.md`, `CLAUDE.md`. Note: `adr/0027-test-only-relay-surfaces.md` is **NOT** a required link (D5: no Proposed ADR links).
- **Stale phase claim.** Status text must match CLAUDE.md/project.md current line ("Phase 6a shipped + mobile parity closed; next Phase 6b iOS"). Must contain the literal strings `Phase 6a` and `Phase 6b`.
- **CLI mention vs ADR-0021 proposed status.** Mention CLI as a shipping package (real code + scripts), but per D5 do **not** link ADR-0021 by number.
- **Playwright browser binaries.** `pnpm test:e2e` requires Playwright's browser binaries; mention `pnpm exec playwright install` in Prerequisites to avoid silent first-run failure.

## Acceptance Criteria

- [ ] AC-1: `/Users/xau/Documents/projects/hnch/README.md` rewritten in place; `wc -l` ≤ 200.
- [ ] AC-2: All 5 packages listed in Repo Layout — each of these names appears at least once: `client`, `cli`, `relay`, `shared`, `e2e`.
- [ ] AC-3: Setup section uses only `pnpm install` — no `ionic start` instructions present.
- [ ] AC-4: Everyday Commands include each of these literal strings: `dev:client`, `dev:relay`, `dev:cli`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm typecheck`.
- [ ] AC-5: Configuration section includes the literal strings `1234`, `hnch.relayUrl`, and `AppPreferenceService`.
- [ ] AC-6: All inline relative markdown links resolve to files that exist on disk. No anchor-only, reference-style, or image links.
- [ ] AC-7: No License section, no emojis, no `Co-Authored-By` substring (case-insensitive). No commits authored by an agent for this work include a Co-Authored-By trailer.
- [ ] AC-8: Status section contains the literal strings `Phase 6a` and `Phase 6b`.
- [ ] AC-9: No Proposed ADRs (0021, 0022, 0023, 0024, 0025, 0026, 0027, 0028) are linked by number from the README.

## Stories

### Story 1: Rewrite README

- [ ] **T1: Rewrite root README.md** [haiku]
  - Package: root (handled by `shared-haiku` with explicit per-task scope override — see Decisions D1; pending user confirmation)
  - files-touched: `README.md`
  - What: Replace `/Users/xau/Documents/projects/hnch/README.md` contents in full per the section outline above. Use existing README only as a structural reference; do not preserve the `ionic start` block or the 3-package tree. Source factual content from CLAUDE.md, project.md, roadmap.md, and the research findings already provided in the task brief (relay env vars, client relay URL key, package list/scripts).
  - **Orchestrator brief must include:** (1) explicit instruction "for this task only, you may write to the repo root `README.md`; your normal package-scope rule is overridden", and (2) a copy of Section "Spec" + "Acceptance Criteria" from this plan. Without (1), shared-haiku will refuse on scope guard.
  - AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
  - blockedBy: —

### Story 2: Verification (test-runner-haiku)

- [ ] **V1: README sanity checks** [haiku]
  - Package: root
  - files-touched: — (read-only)
  - What:
    1. **AC-1 (LOC):** `wc -l /Users/xau/Documents/projects/hnch/README.md` → assert ≤ 200.
    2. **AC-6 (links):** Extract every inline markdown link `[text](target)` from README.md. Filter out targets matching `^https?:`, `^mailto:`, or `^#`. For each remaining target: strip a trailing ` "..."` title (one space + double-quoted title at end), URL-decode if applicable, then assert the file exists at the path resolved against the repo root `/Users/xau/Documents/projects/hnch/`. Fail if any target is broken. Additionally fail if the README contains any reference-style link (regex `^\[[^\]]+\]:\s+`), any image link (regex `!\[[^\]]*\]\([^)]+\)`), or any anchor-only inline link (regex `\]\(#[^)]*\)`).
    3. **AC-7 (Co-Authored-By):** `grep -i "co-authored-by" README.md` — must be absent (exit code 1).
    4. **D4 hygiene:** `grep -i "ionic start" README.md` — must be absent.
    5. **AC-2 (packages):** assert each of these substrings appears at least once: `client`, `cli`, `relay`, `shared`, `e2e`.
    6. **AC-4 (commands):** assert each of these substrings appears at least once: `dev:client`, `dev:relay`, `dev:cli`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm typecheck`.
    7. **AC-5 (configuration):** assert each of these substrings appears at least once: `1234`, `hnch.relayUrl`, `AppPreferenceService`.
    8. **AC-8 (phase):** assert both `Phase 6a` and `Phase 6b` appear.
    9. **AC-9 (no Proposed ADR links):** for each of `0021`, `0022`, `0023`, `0024`, `0025`, `0026`, `0027`, `0028`, assert no inline link target matches `adr/00<NN>-*.md`. (Bare number mentions in prose, e.g., "ADR-0021", are tolerated; only link references are checked.)
    10. **AC-7 (License/emojis):** assert no top-level heading `## License` (or `# License`). Assert no characters in the basic emoji ranges (U+1F300–U+1FAFF, U+2600–U+27BF — common emoji blocks). Caveman runner can use `python3 -c` or `rg` with a Unicode class.
  - AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
  - blockedBy: T1
  - Note: No markdown lint config exists in repo (researcher confirmed) — these greps + LOC + link-existence checks **are** the contract.

## Parallelism Timeline

```
Story 1 — single task:
  Slot A: T1                 (writer-haiku, scope override)
Story 2 — verification:
  Slot A: V1                 (test-runner-haiku, after T1)
Critical path: T1 → V1 (length 2)
```

Trivial graph — no parallelism opportunity. Single-file scope (`README.md`) means no file-collision risk; `files-touched` collision rule trivially satisfied.

## Team Recommendation

### Agent Roster

| Agent | subagent_type | Stories | Spawn | Despawn |
|-------|---------------|---------|-------|---------|
| writer-haiku (= shared-haiku w/ root override per D1) | shared-haiku | S1 | S1 start | after S1 review clean |
| reviewer | reviewer | S1 | S1 start | after V1 clean |
| test-runner-haiku | test-runner-haiku | S2 | S2 start | after V1 clean |

3 concurrent agents max — well under the 6 cap.

### Reviewer Strategy

Single `reviewer` covers Story 1. Scope: README accuracy (factual claims match CLAUDE.md / project.md / actual `package.json` scripts), link validity, LOC budget compliance, no emojis / no Co-Authored-By, ADR citations point only at **Accepted** ADRs (per D5).

No `security-reviewer` needed — README touches no auth, hashing, ws codes, snapshot, or ADR-0009/0017 surfaces.

**Tier note (plan-critic C5):** the `reviewer` agent is opus-tier. For a 200-LOC prose rewrite this is heavier than strictly needed. Acceptable trade-off because (a) the work is one task, single-pass, so review cost is bounded; (b) factual accuracy across 9 ACs and ADR-citation discipline benefits from stronger review judgement than a haiku-tier reviewer would provide; (c) no haiku-tier reviewer exists in the current roster. If future similar root-doc tasks become routine, consider adding a `reviewer-haiku` for prose-only work.

### Concurrency Timeline

```
Story 1: writer-haiku, reviewer        (2 agents)
Story 2: test-runner-haiku, reviewer   (2 agents) — despawn writer-haiku after S1 review clean
```

Reviewer remains spawned across both stories to confirm verification output and sign off final state.

## Key Files Reference

Implementer will read these to source factual content:

- `/Users/xau/Documents/projects/hnch/CLAUDE.md` — stack summary, current decisions, ADR map (status of every ADR — use only Accepted ones for inline links)
- `/Users/xau/Documents/projects/hnch/project.md` — product description, principles, status line
- `/Users/xau/Documents/projects/hnch/roadmap.md` — phase definitions for Status section
- `/Users/xau/Documents/projects/hnch/package.json` — root scripts (`dev:client`, `dev:relay`, `dev:cli`, `lint`, `test`, `build`, `typecheck`)
- `/Users/xau/Documents/projects/hnch/pnpm-workspace.yaml` — workspaces config
- `/Users/xau/Documents/projects/hnch/adr/README.md` — ADR index, status column (verify "Accepted" before linking)
- Existing `/Users/xau/Documents/projects/hnch/README.md` — structural reference only; replace contents

Implementer must NOT read packages/* source files — all needed package facts (names, scripts, purposes, relay env vars, client relay URL key) are already in this plan's research findings section. If anything seems missing, message orchestrator before editing.
