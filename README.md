# hnch

A pointing poker app for agile teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Status

The PWA and the CLI are live, with the relay and PWA on Cloudflare at `hnch.dev`. Next up: Phase 6b, the native builds. See [roadmap.md](docs/roadmap.md#1-current-state) for where things stand.

## Codecov

[![codecov](https://codecov.io/gh/IIxauII/hnch/branch/main/graph/badge.svg?token=5WZDV0OV3F)](https://codecov.io/gh/IIxauII/hnch)

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Angular 20 |
| UI | Ionic 8 + Capacitor 8 |
| Native | iOS/Android via Capacitor |
| State | Yjs CRDT |
| Sync | Content-blind relay speaking the y-websocket protocol |
| Storage | SQLite (native), IndexedDB (PWA) |
| Relay | Cloudflare Workers + Durable Objects ([ADR-0051](adr/0051-cloudflare-hosting.md)) |
| Platforms | iOS, Android, PWA |

## Repo layout

pnpm workspaces monorepo per [ADR-0014](adr/0014-repo-layout-pnpm-workspaces.md):

```
hnch/
├── packages/
│   ├── client/      # Angular + Ionic + Capacitor app
│   ├── cli/         # Ink+React terminal client
│   ├── relay/       # Cloudflare Worker + Durable Objects relay
│   ├── shared/      # Types, Yjs helpers, auth, room codes
│   └── e2e/         # Playwright test suite
├── adr/             # Architecture Decision Records (immutable)
├── docs/            # project.md, schema.md, ux.md, roadmap.md, and more
├── infra/           # Self-hosted CI runner pool
├── scripts/         # Worktree, release and CI helpers
├── CLAUDE.md        # Agent guidance and the doc list
├── CONTRIBUTING.md  # Commit, PR and worktree rules
├── GLOSSARY.md      # Domain terms
└── [other root files]
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
pnpm dev:relay         # Relay on local workerd via wrangler dev (packages/relay)
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

**Relay** listens on `PORT` in local dev (default `1234`).

**Client relay URL** in dev follows the client's own port, so each parallel worktree reaches its own relay with no extra config ([how port isolation works](CONTRIBUTING.md#how-port-isolation-works)). At runtime, users can override the relay URL via `AppPreferenceService` — set Capacitor Preferences key `hnch.relayUrl` to `https://your.relay.com` and the client will use that (ws auto-derived from https).

**Test-only env vars:** `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` exist for the e2e suite and must remain unset in production.

## Architecture at a glance

- **Yjs CRDTs** synced via a content-blind relay — no direct WebRTC, no authoritative server ([ADR-0001](adr/0001-networking-crdt-over-relay.md), [ADR-0003](adr/0003-state-sync-yjs.md)).
- **Stack** — Angular + Ionic + Capacitor for the client ([ADR-0002](adr/0002-frontend-framework-angular-ionic-capacitor.md)); the relay runs on Cloudflare Workers with one Durable Object per room ([ADR-0051](adr/0051-cloudflare-hosting.md)).
- **Access control** enforced at the relay via opaque tokens ([ADR-0009](adr/0009-access-control-relay-tokens.md)).
- **Host election** — the room elects a new host on its own when the host drops; rule in [schema.md § Host election](docs/schema.md#host-election).
- **Rooms** — room-code format in [project.md § Joining a Session](docs/project.md#joining-a-session), participant cap in [project.md § Participants](docs/project.md#participants).
- **Snapshots** — each room's state is kept for 24 hours after it empties, keyed by room UUID ([ADR-0012](adr/0012-snapshot-policy.md), [ADR-0051](adr/0051-cloudflare-hosting.md)).

## Documentation

The list of project docs, and what each one is authoritative for, is in [CLAUDE.md § Documentation layout](CLAUDE.md#documentation-layout).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR requirements, commit style (Conventional Commits), ADR discipline, and the semantic-release flow that drives versioning + deploys from commit messages.
