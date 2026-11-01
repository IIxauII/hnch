# hnch

An estimating app for teams. The name is a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of ticket/effort estimation.

## Usage

#### in browser

* https://hnch.dev

#### as CLI

* https://www.npmjs.com/package/@xauyxau/hnch

#### as native app

* WIP

## Codecov

[![codecov](https://codecov.io/gh/IIxauII/hnch/branch/main/graph/badge.svg)](https://codecov.io/gh/IIxauII/hnch)

## Architecture at a glance

- **Yjs CRDTs** synced via a content-blind relay — no direct WebRTC, no authoritative server ([ADR-0001](adr/0001-networking-crdt-over-relay.md), [ADR-0003](adr/0003-state-sync-yjs.md)).
- **Stack** — Angular + Ionic + Capacitor for the client ([ADR-0002](adr/0002-frontend-framework-angular-ionic-capacitor.md)); the relay runs on Cloudflare Workers with one Durable Object per room ([ADR-0051](adr/0051-cloudflare-hosting.md)).
- **Access control** enforced at the relay via opaque tokens ([ADR-0009](adr/0009-access-control-relay-tokens.md)).
- **Host election** — the room elects a new host on its own when the host drops; rule in [schema.md § Host election](docs/schema.md#host-election).
- **Rooms** — room-code format in [project.md § Joining a Session](docs/project.md#joining-a-session), participant cap in [project.md § Participants](docs/project.md#participants).
- **Snapshots** — each room's state is kept for 24 hours after it empties, keyed by room UUID ([ADR-0012](adr/0012-snapshot-policy.md), [ADR-0051](adr/0051-cloudflare-hosting.md)).

## Documentation

The list of project docs, is in [CLAUDE.md § Documentation layout](CLAUDE.md#documentation-layout).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR requirements, commit style (Conventional Commits), ADR discipline, and the semantic-release flow that drives versioning + deploys from commit messages.

## License

Copyright © 2026 xau. hnch is free software under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).

If you run a modified copy as a network service (a hosted web client or relay), the AGPL requires you to offer its users the source of your version. The web app (Settings → About) and the CLI (`hnch --help`, `hnch --version`) link to the source; point those links at your own repository.
