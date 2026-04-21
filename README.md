# hnch

A pointing poker (planning poker) app for agile teams. The name is a vowel-dropped spelling of "hunch" — reflecting the gut-feel nature of story point estimation.

Team members pick an estimate independently; all choices reveal simultaneously to avoid anchoring bias.

## Status

Greenfield. Architectural decisions are resolved (see [`adr/`](adr/README.md)); repo scaffolding is in place; feature implementation has not yet begun.

## Design docs

- [`project.md`](project.md) — product and design overview (what the app does).
- [`schema.md`](schema.md) — Yjs doc schema (the shape of session state).
- [`adr/`](adr/README.md) — Architecture Decision Records (why each structural choice was made).
- [`networking-analysis.md`](networking-analysis.md) — research artifact behind ADR-0001.
- [`CLAUDE.md`](CLAUDE.md) — guidance for the coding agent working in this repo.

## Repo layout

pnpm workspaces monorepo per [ADR-0014](adr/0014-repo-layout-pnpm-workspaces.md):

```
hnch/
├── packages/
│   ├── client/      # Angular + Ionic + Capacitor app (scaffolded via `ionic start`)
│   ├── relay/       # Node.js y-websocket relay
│   └── shared/      # @hnch/shared — room codes, auth shapes, etc.
├── adr/             # Architecture Decision Records
├── project.md
├── schema.md
└── networking-analysis.md
```

## Local setup

### Prerequisites

- **Node.js 22+** (see `engines` in `package.json`)
- **pnpm 9+** — install via Corepack (recommended) or globally:
  ```sh
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
  # or: npm install -g pnpm@9
  ```
- **Ionic CLI** (only needed the first time, to scaffold the client):
  ```sh
  npm install -g @ionic/cli
  ```

This repo's root `package.json` uses a `preinstall` guard that blocks `npm install` and `yarn install` — use `pnpm` only.

### First-time scaffold of the Ionic client

The `packages/client` directory is intentionally empty in-repo; scaffold it with the Ionic CLI the first time you clone:

```sh
cd packages
ionic start client blank --type=angular --capacitor --no-git --no-deps
cd client
# rename the generated package so it participates in the workspace
# (edit packages/client/package.json: set "name": "@hnch/client")
cd ../..
pnpm install
```

After scaffolding, commit `packages/client` so subsequent clones don't need to re-run `ionic start`. If you want to keep the client's scaffold step committed but reproducible, document any Ionic CLI flags you used.

### Everyday commands

Run from the repo root:

```sh
pnpm install              # install all dependencies, link workspaces
pnpm -r run build         # build every package that has a build script
pnpm -r run test          # run tests across the workspace
pnpm -r run typecheck     # type-check without emitting
pnpm --filter @hnch/relay run dev    # run the relay in watch mode
pnpm --filter @hnch/client run start # serve the Ionic client
```

The root has convenience aliases too: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`, `pnpm dev`.

## Architecture at a glance

See [`CLAUDE.md`](CLAUDE.md) for the current-decisions summary, or [`adr/README.md`](adr/README.md) for the full index. The short version:

- Yjs CRDTs synced via a content-blind y-websocket relay (ADR-0001, ADR-0003).
- Angular + Ionic + Capacitor for the client; Node.js for the relay (ADR-0002).
- Ephemeral sessions, local-only Team concept, per-device identity (ADR-0005, ADR-0006, ADR-0007).
- Access control enforced at the relay via opaque tokens (ADR-0009).
- 24-hour in-memory snapshots on the relay for rejoin-after-everyone-left (ADR-0012).

## Contributing

Any architectural or structural change needs a new ADR. See [`adr/README.md`](adr/README.md) for conventions. ADRs are immutable once accepted — direction changes land as new ADRs that supersede older ones.
