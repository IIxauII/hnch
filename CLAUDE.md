# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**hnch** — a pointing poker (planning poker) app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

Core mechanic: team members independently select an estimate (typically Fibonacci-like sequences), then all choices are revealed simultaneously to avoid anchoring bias.

## Status

Greenfield project. Core architectural decisions are resolved and documented as ADRs; implementation has not yet begun. See `project.md` for the product/design overview and the `adr/` folder for the authoritative record of *why* each structural decision was made.

## Documentation layout

- `project.md` — product and design overview: what the app does, high-level architecture, user-visible behavior. The authoritative source for *what* the product is.
- `schema.md` — the Yjs doc schema. Authoritative for the *shape* of session state, cross-linked to the ADRs that justify each field.
- `ux.md` — user experience design: screen inventory, flows, per-screen wireframes, interaction patterns, theming. The authoritative source for *what the user sees and does*. Cross-links to ADRs where UX decisions touch architecture.
- `roadmap.md` — phased implementation plan from the current scaffold to a v1 candidate. A map, not a spec: each phase has a scope and an exit bar.
- `angular.md` — Angular and TypeScript coding conventions for the client package: signals, standalone components, control-flow syntax, accessibility baseline, and other house rules. Consult before writing or reviewing client code.
- `adr/` — Architecture Decision Records. The authoritative source for *why* each structural choice was made, what alternatives were considered, and under what conditions a decision should be revisited. See `adr/README.md` for conventions and the index.
- `networking-analysis.md` — research artifact that informed ADR-0001 (networking architecture). Kept as a reference; not updated as decisions evolve.

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

For quick orientation without reading all 15 ADRs:

- **Architecture:** Yjs CRDTs synchronized via a content-blind y-websocket relay. No direct WebRTC. No authoritative session server. (ADR-0001, ADR-0003)
- **Stack:** Angular + Ionic + Capacitor for the client; Node.js y-websocket relay for the server. (ADR-0002)
- **Local persistence:** Capawesome SQLite on native, IndexedDB on PWA — native path avoids iOS WKWebView's 7-day eviction. (ADR-0004)
- **Identity:** Capacitor Device plugin for the per-device ID, cached in Preferences; no accounts, no fingerprinting. (ADR-0005)
- **Sessions:** ephemeral per meeting, with a separate local-only Team concept for "my usual crew" continuity. (ADR-0006, ADR-0007)
- **Room codes:** 6-char alphanumeric, no look-alikes, retired for snapshot TTL before pool recycling. (ADR-0008)
- **Access control:** relay-enforced via opaque tokens (password hash, single-use invite tokens). (ADR-0009)
- **Host authority:** creator is initial host; on drop, 5-second debounce then lowest-peer-ID election. (ADR-0010)
- **Timer:** host writes `timerStartedAt` to the round at round start; all clients compute locally against `settings.timerDurationMs`; host's client authoritatively triggers reveal. (ADR-0011, ADR-0015)
- **Snapshots:** 24-hour in-memory TTL on the relay, keyed by room UUID; no disk persistence. (ADR-0012)
- **Rounds:** flat list with optional `parentRoundId` for re-vote lineage; vote change allowed until reveal. (ADR-0013)
- **Repo layout:** pnpm workspaces monorepo with `packages/client`, `packages/relay`, `packages/shared`. (ADR-0014)
- **v1 scope (reveal/timer):** reveal modes are `manual | timer` only (no `unanimous`); `revealMode` and `timerDurationMs` live on `settings`, not on rounds. (ADR-0015)
