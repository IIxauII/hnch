# hnch

A pointing poker app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Status

Phase 6a shipped (PWA polish, settings, theming, animations, haptics, a11y). Mobile parity closed the remaining CLI-mobile feature gaps. Next up: Phase 6b (native iOS build). See [roadmap.md](docs/roadmap.md) for the phased plan.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Angular 20 |
| UI | Ionic 8 + Capacitor 8 |
| Native | iOS/Android via Capacitor |
| State | Yjs CRDT |
| Sync | Content-blind y-websocket relay |
| Storage | SQLite (native), IndexedDB (PWA) |
| Relay | Node.js |
| Platforms | iOS, Android, PWA |

## Repo layout

pnpm workspaces monorepo per [ADR-0014](adr/0014-repo-layout-pnpm-workspaces.md):

```
hnch/
├── packages/
│   ├── client/      # Angular + Ionic + Capacitor app
│   ├── cli/         # Ink+React terminal client
│   ├── relay/       # Node.js y-websocket relay
│   ├── shared/      # Types, Yjs helpers, auth, room codes
│   └── e2e/         # Playwright test suite
├── adr/             # Architecture Decision Records (immutable)
├── plans/           # Research and planning docs
├── project.md       # Product overview
├── schema.md        # Yjs document schema
├── CLAUDE.md        # Agent guidance
└── [other docs]
```

## Prerequisites

- **Node.js 22+** and **pnpm 9+** (via Corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`).
- No npm or yarn — the repo uses a `preinstall` guard that enforces pnpm.
- If running e2e tests, run `pnpm exec playwright install` from `packages/e2e` once.

## Setup

```sh
pnpm install
```

## Everyday commands

```sh
# Development servers
pnpm dev:client        # Angular dev server (packages/client)
pnpm dev:relay         # Relay in watch mode (packages/relay, PORT=1234)
pnpm dev:cli           # CLI in watch mode (packages/cli)

# Testing, linting, and builds
pnpm test              # Run all package tests
pnpm test:e2e          # Run Playwright e2e suite
pnpm lint              # Lint all packages
pnpm build             # Build all packages
pnpm typecheck         # Type-check without emit

# Per-package targets
pnpm --filter shared test
pnpm --filter @hnch/relay typecheck
pnpm --filter @xauyxau/hnch build
```

## Configuration

**Relay** defaults to `PORT=1234` (override via env var).

**Client relay URL** in dev is derived at runtime from `window.location.port` (convention: `RELAY_PORT = 1234 + (CLIENT_PORT − 4200)`) — so `localhost:4200` connects to relay at `localhost:1234`, and each parallel worktree targets its own relay automatically. At runtime, users can override the relay URL via `AppPreferenceService` — set Capacitor Preferences key `hnch.relayUrl` to `https://your.relay.com` and the client will use that (ws auto-derived from https).

**Test-only env vars:** `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` exist for the e2e suite and must remain unset in production.

## Architecture at a glance

- **Yjs CRDTs** synced via a content-blind y-websocket relay — no direct WebRTC, no authoritative server ([ADR-0001](adr/0001-networking-crdt-over-relay.md), [ADR-0003](adr/0003-state-sync-yjs.md)).
- **Stack** — Angular + Ionic + Capacitor for the client; Node.js for the relay ([ADR-0002](adr/0002-frontend-framework-angular-ionic-capacitor.md)).
- **Access control** enforced at the relay via opaque tokens ([ADR-0009](adr/0009-access-control-relay-tokens.md)).
- **Host election** — creator is initial host; on drop, 5-second debounce then lowest-peer-ID election ([ADR-0010](adr/0010-host-election.md)).
- **Snapshots** — 24-hour in-memory TTL on the relay, keyed by room UUID ([ADR-0012](adr/0012-snapshot-policy.md)).

## Documentation

- [project.md](docs/project.md) — what the product is, core mechanics, principles.
- [roadmap.md](docs/roadmap.md) — phased implementation plan and exit bars.
- [schema.md](docs/schema.md) — Yjs document structure (authoritative).
- [ux.md](docs/ux.md) — screens, flows, wireframes, interaction patterns.
- [cli.md](docs/cli.md) — CLI package design and behavior.
- [angular.md](docs/angular.md) — Angular coding conventions for the client.
- [ionic.md](docs/ionic.md) — Ionic theming, platform modes, safe areas.
- [adr/README.md](adr/README.md) — ADR index and conventions.
- [CLAUDE.md](CLAUDE.md) — agent guidance, stack summary, current decisions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR requirements, commit style (Conventional Commits), ADR discipline, and the semantic-release flow that drives versioning + deploys from commit messages.
