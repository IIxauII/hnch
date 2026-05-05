# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**hnch** — a pointing poker (planning poker) app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

Core mechanic: team members independently select an estimate (typically Fibonacci-like sequences), then all choices are revealed simultaneously to avoid anchoring bias.

## Status

Implementation through Phase 6a (PWA polish) plus mobile-parity gap closure. Phases 1–4 shipped the scaffold, doc/CRDT layer, relay sync, multi-client sessions, timer-driven reveal, and host election. Phase 5 added password-protected rooms, share/QR/deep-link join paths, and a Playwright e2e suite. Phase 6a added settings screen, theme picker, reveal animation, haptic wiring, and an accessibility pass. The separate Revealed page has since been removed — after a round is revealed, Estimating navigates back to Lobby, which shows results inline (VoteResultsComponent) and a compact round history list (RoundHistoryComponent). Mobile parity closed the remaining CLI-mobile feature gaps: in-session room name editing, default session name/password preferences, and relay URL override via `AppPreferenceService`. Next up: Phase 6b (native iOS build). See `roadmap.md` for the phased plan and `project.md` for the product/design overview. ADRs in `adr/` document every structural decision.

## Documentation layout

- `project.md` — product and design overview: what the app does, high-level architecture, user-visible behavior. The authoritative source for *what* the product is.
- `schema.md` — the Yjs doc schema. Authoritative for the *shape* of session state, cross-linked to the ADRs that justify each field.
- `ux.md` — user experience design: screen inventory, flows, per-screen wireframes, interaction patterns, theming. The authoritative source for *what the user sees and does*. Cross-links to ADRs where UX decisions touch architecture.
- `roadmap.md` — phased implementation plan from the current scaffold to a v1 candidate. A map, not a spec: each phase has a scope and an exit bar.
- `angular.md` — Angular and TypeScript coding conventions for the client package: signals, standalone components, control-flow syntax, accessibility baseline, and other house rules. Consult before writing or reviewing client code.
- `ionic.md` — Ionic-specific conventions: platform mode, dark mode / theming (class-based toggling via `ThemeService`), half-sheet modal pattern, component imports, icons, safe areas. Consult alongside `angular.md`.
- `adr/` — Architecture Decision Records. The authoritative source for *why* each structural choice was made, what alternatives were considered, and under what conditions a decision should be revisited. See `adr/README.md` for conventions and the index.

## ADR requirement

Any architectural or structural change must be accompanied by a new ADR in `adr/` — never by silently editing an existing one. This includes:

- Introducing or removing a technology from the stack.
- Changing the shape of the Yjs document, the sync protocol, or the relay's responsibilities.
- Changing how identity, sessions, rooms, access control, host election, timers, or snapshots work.
- Reversing or meaningfully modifying a previous ADR.

ADRs are **immutable once accepted**. To change direction, write a new ADR that supersedes the old one (status: `Superseded by ADR-XXXX`). Minor corrections (typos, broken links, clarifications) to an accepted ADR are fine; substantive change requires a new ADR.

See `adr/README.md` for the full conventions, numbering scheme, and template (`adr/0000-template.md`).

When proposing a code change that conflicts with an existing ADR, either adjust the change to conform or draft the superseding ADR first and get agreement before implementing.

## Current decisions at a glance

For quick orientation without reading all 36 ADRs:

- **Architecture:** Yjs CRDTs synchronized via a content-blind y-websocket relay. No direct WebRTC. No authoritative session server. (ADR-0001, ADR-0003)
- **Stack:** Angular + Ionic + Capacitor for the client; Node.js y-websocket relay for the server. (ADR-0002)
- **Local persistence:** Capawesome SQLite on native, IndexedDB on PWA — native path avoids iOS WKWebView's 7-day eviction. (ADR-0004)
- **Identity:** Capacitor Device plugin for the per-device ID, cached in Preferences; no accounts, no fingerprinting. (ADR-0005)
- **Sessions:** ephemeral per meeting, with a separate local-only Team concept for "my usual crew" continuity. (ADR-0006, ADR-0007)
- **Room codes:** 6-char alphanumeric, no look-alikes, retired for snapshot TTL before pool recycling. (ADR-0008)
- **Access control:** relay-enforced via opaque tokens (password hash, single-use invite tokens). (ADR-0009)
- **Connection handshake:** HTTP `GET /rooms/:code` resolves code → UUID; WebSocket to `/ws/:uuid` carries `JoinCredentials` as query params; rejections use private-use WS close codes 4001–4099. (ADR-0016)
- **Host authority:** creator is initial host; on drop, 5-second debounce then lowest-peer-ID election. (ADR-0010)
- **Reveal:** manual (host taps Reveal) + unanimous auto-reveal (fires when all online voters have voted). No countdown timer. `timerStartedAt` written at round creation as stopwatch origin for elapsed time display. (ADR-0018, supersedes ADR-0011/ADR-0015)
- **Snapshots:** 24-hour in-memory TTL on the relay, keyed by room UUID; no disk persistence. (ADR-0012)
- **Rounds:** flat list with optional `parentRoundId` for re-vote lineage; vote change allowed until reveal. (ADR-0013)
- **Password protection:** PBKDF2-SHA-256 via Web Crypto (100k iterations, room UUID as salt). Wrong-password rejection surfaces via WS close `4002` (post-upgrade), not pre-upgrade HTTP 403, so browsers can read the reason. Invite-only mode dropped from v1 scope. (ADR-0017, ADR-0035)
- **Scales:** 5 builtin presets (`fibonacci`, `t-shirt`, `powers-of-2`, `linear`, `risk`); `?` and `☕` sentinel cards removed. Device-local customization via `PresetOverrides` (toggle cards per preset) and `CustomScale` (arbitrary card set, ID prefixed `custom-`). Resolved client-side before writing to the doc — wire format is always flat `{ id, cards }`. (ADR-0019)
- **Participant roles:** every participant has a `role` field on their doc record — `voter` (default) or `viewer`. Viewers excluded from unanimous auto-reveal denominator so observers don't block reveals; toggleable in-session. (ADR-0020)
- **Participant removal:** soft-delete via optional `leftAt` + `removedBy` fields on the participant record. "Leave Session" and host-kick (swipe-left → Remove) write the fields; transient disconnect does not. Active rosters filter on `!leftAt`; round history reads the raw map so departed names still resolve. No relay-side ban — kicked users can re-enter via room code (their `leftAt` is cleared on rejoin); password rotation is the persistent-removal lever. (ADR-0036)
- **CLI:** fourth deliverable (`packages/cli`, `@xauyxau/hnch`) — Node.js + Ink terminal client with full wire-protocol parity to the mobile client. Identity and persistence differ (no Capacitor plugins); protocol surface is identical. (ADR-0021)
- **Last-session cache:** shared base `{ roomCode, roomUuid, lastSeenAt }` with a 24 h TTL aligned to the relay snapshot TTL. Mobile client extends with `lastScreen: 'lobby' | 'estimating'` to restore the right route on rejoin; CLI extends with optional `passwordHash` for unattended `hnch resume` of password-protected rooms. (ADR-0022)
- **Session-end broadcast:** host writes `meta.sessionEndedAt` to the Yjs doc; all clients observe the field, show a toast, and navigate Home. Absent = still active. (ADR-0023)
- **Participant cap:** 20-peer hard limit enforced at the relay on WebSocket upgrade (close code 4006). (ADR-0024)
- **Reconnect backoff:** y-websocket default exponential backoff + a `window online` event handler that force-resets backoff and closes stale sockets — works around a Chromium quirk where the network reports up before existing sockets tear down. (ADR-0025)
- **Deep-link URL format:** `<origin>/join?code=XXXXXX`; no password in URL; case-insensitive; origin resolved at runtime from `window.location.origin` (not a build-time constant). (ADR-0026, ADR-0031)
- **Test-only relay surfaces:** `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` env vars gate test-only behavior in the production relay binary; both are off by default in production. (ADR-0027)
- **Telemetry:** none in v1 — no analytics, no crash reporting, no outbound data channels beyond the relay's own sync traffic. (ADR-0028)
- **Repo layout:** pnpm workspaces monorepo with `packages/client`, `packages/relay`, `packages/shared`, `packages/e2e` (Playwright), `packages/cli`. (ADR-0014, ADR-0021)
- **Deployment:** relay runs bare-metal on a single IONOS VPS, supervised by systemd, fronted by Caddy with auto-TLS via Let's Encrypt. PWA + relay served from a single origin (`hnch.dev`) with Caddy routing `/health`, `/rooms*`, `/ws*` to `127.0.0.1:1234`. Bootstrap script + Caddyfile + systemd unit live in `infra/`. Relay deploys via `deploy-relay.yml` on `relay-v*` tags; PWA deploys via `deploy-client.yml` on `client-v*` tags, shipping to `/var/www/hnch-client/` via atomic symlink swap (no reload). (ADR-0029)
- **CI runners:** all `ci.yml` jobs (the `verify` matrix, `e2e`, plus `detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`) run on a pool of 4 ephemeral arm64 Podman containers on a Mac mini M4. `release.yml` and `deploy-*.yml` are next to flip per ADR-0037; `runner-health.yml` stays on `ubuntu-latest` permanently as the dead-man's-switch that detects when the pool is dead. Image built from `debian:bookworm-slim` + sha256-verified official `actions/runner` tarball + ~30-line own entrypoint (no third-party Docker Hub image). Supervised by a LaunchAgent; `vars.LINUX_RUNNER` repo variable toggles every flipped job back to `ubuntu-latest` in one command (`gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'`). Tart-based macOS runner deferred to Phase 9 (gated on Phase 6b iOS). Runner files in `infra/runner/`; runbook in `infra/README.md`. (ADR-0032, ADR-0033, ADR-0037)

## Parallel worktrees

This repo is set up for parallel git worktrees with per-worktree port isolation. Each worktree gets its own `CLIENT_PORT` / `RELAY_PORT` (offsets of 100 from `4200` / `1234`), written to `.env.local` by the bootstrap script. Two or more `pnpm dev:client` / `pnpm dev:relay` processes can run side-by-side without collision.

Use it when:
- Executing a multi-phase plan or any chunk of work that takes more than a few iterations — keep `main` clean, isolate the in-progress branch.
- Running long-lived dev servers (relay + client) for one feature while reviewing or hot-fixing another.
- The user explicitly asks for a worktree, or the task naturally branches into independent tracks.

Commands (run from the repo root):
- `pnpm worktree:add <name> [base-branch]` — creates `../hnch-<name>`, branches off `<base-branch>` (default `main`), assigns unique ports, runs `pnpm install`. **Run `git fetch origin` first** — the script branches off the local ref, so a stale local `main` produces a worktree missing recent commits. Symptom: agents in the worktree don't see files added by recently-merged PRs and may recreate them from scratch with diverging APIs.
- `pnpm worktree:remove <name>` — tears down the worktree dir. The branch ref is preserved; delete with `git branch -D <name>` if no longer needed.
- `pnpm worktree:bootstrap` — re-run inside an existing worktree to regenerate `.env.local` (idempotent, safe).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and the worktree section in `scripts/`.

## Commit conventions

- Do **not** add a `Co-Authored-By` trailer to commit messages.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) — commit type drives the semantic-release version bump on merge to `main`.
- **Scope is required** on every PR title — chosen from the allowlist enforced by the `PR title (Conventional Commits)` CI check. See [CONTRIBUTING.md](CONTRIBUTING.md#commit-style--conventional-commits) for the table. Scopeless titles fail CI and don't trigger any release.
- **Multi-package PRs use comma-separated scopes** — `feat(client,shared): ...`, `fix(relay,shared): ...`, `feat(client,cli,shared)!: ...`. No spaces. Every package the PR modifies must appear in the scope list, otherwise the omitted package gets no version bump and silently drifts. semantic-release fires one release per listed releasing scope at the level the commit type implies. Verify coverage with `git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u` before pushing. Split into separate PRs only when one side is genuinely a different commit type (feat vs fix), one side is breaking and the other isn't, or the diff is too large to review together. See [CONTRIBUTING.md → Multi-scope titles](CONTRIBUTING.md#multi-scope-titles).
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full PR requirements, release flow, and pre-push checklist.
