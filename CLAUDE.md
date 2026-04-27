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

For quick orientation without reading all 19 ADRs:

- **Architecture:** Yjs CRDTs synchronized via a content-blind y-websocket relay. No direct WebRTC. No authoritative session server. (ADR-0001, ADR-0003)
- **Stack:** Angular + Ionic + Capacitor for the client; Node.js y-websocket relay for the server. (ADR-0002)
- **Local persistence:** Capawesome SQLite on native, IndexedDB on PWA — native path avoids iOS WKWebView's 7-day eviction. (ADR-0004)
- **Identity:** Capacitor Device plugin for the per-device ID, cached in Preferences; no accounts, no fingerprinting. (ADR-0005)
- **Sessions:** ephemeral per meeting, with a separate local-only Team concept for "my usual crew" continuity. (ADR-0006, ADR-0007)
- **Room codes:** 6-char alphanumeric, no look-alikes, retired for snapshot TTL before pool recycling. (ADR-0008)
- **Access control:** relay-enforced via opaque tokens (password hash, single-use invite tokens). (ADR-0009)
- **Connection handshake:** HTTP `GET /rooms/:code` resolves code → UUID; WebSocket to `/ws/:uuid` carries `JoinCredentials` as query params; rejections use private-use WS close codes 4001–4099. (ADR-0016)
- **Host authority:** creator is initial host; on drop, 5-second debounce then lowest-peer-ID election. (ADR-0010)
- **Reveal:** manual (host taps Reveal) + unanimous auto-reveal (fires when all online participants have voted). No countdown timer. `timerStartedAt` written at round creation as stopwatch origin for elapsed time display. (ADR-0018, supersedes ADR-0011/ADR-0015)
- **Snapshots:** 24-hour in-memory TTL on the relay, keyed by room UUID; no disk persistence. (ADR-0012)
- **Rounds:** flat list with optional `parentRoundId` for re-vote lineage; vote change allowed until reveal. (ADR-0013)
- **Password protection:** PBKDF2-SHA-256 via Web Crypto (100k iterations, room UUID as salt). Invite-only mode dropped from v1 scope. (ADR-0017)
- **Scales:** 5 builtin presets (`fibonacci`, `t-shirt`, `powers-of-2`, `linear`, `risk`); `?` and `☕` sentinel cards removed. Device-local customization via `PresetOverrides` (toggle cards per preset) and `CustomScale` (arbitrary card set, ID prefixed `custom-`). Resolved client-side before writing to the doc — wire format is always flat `{ id, cards }`. (ADR-0019)
- **Participant roles:** every participant has a `role` field on their doc record — `voter` (default) or `viewer`. Viewers excluded from unanimous auto-reveal denominator so observers don't block reveals; toggleable in-session. (ADR-0020)
- **Repo layout:** pnpm workspaces monorepo with `packages/client`, `packages/relay`, `packages/shared`, `packages/e2e` (Playwright). (ADR-0014)
- **Deployment:** relay runs bare-metal on a single IONOS VPS, supervised by systemd, fronted by Caddy with auto-TLS via Let's Encrypt. PWA + relay served from a single origin (`hnch.dev`) with Caddy routing `/health`, `/rooms*`, `/ws*` to `127.0.0.1:1234`. Bootstrap script + Caddyfile + systemd unit live in `infra/`. Deploy via the `deploy-relay.yml` workflow on `relay-v*` tags. (ADR-0029)

## Commit conventions

- Do **not** add a `Co-Authored-By` trailer to commit messages.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) — commit type drives the semantic-release version bump on merge to `main`.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full PR requirements, release flow, and pre-push checklist.
