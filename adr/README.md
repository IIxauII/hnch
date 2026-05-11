# Architecture Decision Records

This folder holds the architectural decisions for hnch. Each ADR captures *why* a choice was made, what alternatives were considered, and what the trade-offs are. Project features and product scope live in `project.md`; this folder is for structural and technical decisions where a reasonable person could have chosen differently.

## Conventions

**Numbering:** sequential, four-digit, zero-padded. Numbers may be reused only after a deletion leaves a gap; otherwise once assigned, never reused. Filenames follow the pattern `NNNN-kebab-case-title.md`.

**Status values:**
- **Proposed** — under discussion, not yet accepted.
- **Accepted** — decision is in effect.
- **Deprecated** — no longer applies but not actively replaced (rare).
- **Superseded by ADR-XXXX** — a later ADR replaces this one. Superseded ADRs may be deleted once the superseding ADR stands alone; if kept, retain as historical reference.

**Immutability:** once an ADR is Accepted, its body is not edited to reflect a change of direction. A new ADR is written that supersedes it. Small corrections (typos, broken links, clarifications, editorial compaction without altering the decision) are fine; substantive change requires a new ADR.

**Style:** terse, bullet-driven. Caveman-ultra: drop articles, filler, hedging — keep technical terms exact. Sections, in order: Context (bullets), Decision (1–2 sentences), Trade-offs (bullets), Consequences (Easier/Harder/Revisit-when bullets). **No Options/Alternatives section** — rejected paths belong in commit/PR discussion, not in the durable ADR. **No Action Items / phase checklists / implementation phases** — track those in the PR or in `plans/`. The ADR captures the decision and what it costs us; nothing else.

**Template:** see `0000-template.md` — copy it to start a new ADR.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-networking-crdt-over-relay.md) | Networking: CRDT sync over a content-blind relay | Accepted |
| [0002](0002-frontend-framework-angular-ionic-capacitor.md) | Frontend framework: Angular + Ionic + Capacitor | Accepted |
| [0003](0003-state-sync-yjs.md) | State sync: Yjs CRDT library | Accepted |
| [0004](0004-local-persistence-sqlite-indexeddb.md) | Local persistence: Capawesome SQLite (native) + IndexedDB (PWA) | Accepted |
| [0005](0005-device-identity-capacitor-device-plugin.md) | Device identity via the Capacitor Device plugin | Accepted |
| [0006](0006-ephemeral-sessions.md) | Sessions are ephemeral (one per meeting) | Accepted |
| [0007](0007-teams-local-only.md) | Teams as a local-only layered concept | Accepted |
| [0008](0008-room-code-format.md) | Room code format and lifecycle | Accepted |
| [0009](0009-access-control-relay-tokens.md) | Access control enforced at the relay via opaque tokens | Accepted |
| [0010](0010-host-election.md) | Host election mechanics | Accepted |
| [0012](0012-snapshot-policy.md) | Ephemeral room snapshot policy | Accepted |
| [0013](0013-round-model-flat-parentroundid.md) | Round model: flat list with parentRoundId linking | Accepted |
| [0014](0014-repo-layout-pnpm-workspaces.md) | Repo layout: pnpm workspaces monorepo | Accepted |
| [0016](0016-client-relay-connection-handshake.md) | Client ↔ relay connection handshake | Accepted |
| [0017](0017-password-hashing-drop-invite-only.md) | Password hashing scheme and invite-only removal | Accepted (password-enforcement clause superseded by ADR-0035) |
| [0018](0018-remove-timer-add-unanimous-reveal.md) | Remove countdown timer; add unanimous auto-reveal | Accepted |
| [0019](0019-scale-customization.md) | Scale customization — builtin presets, sentinel removal, device-local overrides | Accepted |
| [0020](0020-participant-viewer-voter-role.md) | Participant Viewer/Voter Role | Accepted |
| [0021](0021-cli-package.md) | CLI package — fourth deliverable with parity contract and platform-appropriate divergences | Accepted |
| [0022](0022-last-session-cache.md) | Last-session cache — TTL aligned to relay snapshot | Accepted |
| [0023](0023-session-end-broadcast.md) | Session-end-for-everyone — host-written doc broadcast | Accepted |
| [0024](0024-participant-cap.md) | Participant cap — 20-peer hard limit, relay-enforced | Accepted |
| [0025](0025-reconnect-backoff.md) | Reconnect / backoff posture — y-websocket defaults plus `online` reset | Accepted |
| [0026](0026-deep-link-url-format.md) | Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX` | Accepted (origin clause superseded by ADR-0031) |
| [0027](0027-test-only-relay-surfaces.md) | Test-only relay surfaces — `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` | Accepted |
| [0028](0028-telemetry-posture.md) | Telemetry / analytics posture — none in v1 | Accepted |
| [0029](0029-relay-deployment.md) | Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout | Accepted (deploy runner location partially superseded by ADR-0037) |
| [0031](0031-runtime-origin-for-invite-urls.md) | Runtime `window.location.origin` for invite URLs (supersedes ADR-0026 §1) | Accepted |
| [0032](0032-self-hosted-github-actions-runner.md) | Self-hosted GitHub Actions runner — ephemeral arm64 Podman pool on Mac mini M4 (Tart deferred) | Accepted (scope partially superseded by ADR-0037) |
| [0033](0033-runner-image-from-debian-and-actions-runner-tarball.md) | Runner image from `debian:bookworm-slim` + official `actions/runner` tarball (refines ADR-0032 §base-image) | Proposed |
| [0034](0034-qr-scan-native-web-split.md) | QR scan native-vs-web split — single plugin, runtime platform branch, lazy ZXing-WASM polyfill on web | Proposed |
| [0035](0035-wrong-password-post-upgrade-close.md) | Wrong-password rejection on WS close 4002 (supersedes ADR-0017 password-enforcement clause) | Accepted |
| [0036](0036-participant-removal-lifecycle.md) | Participant removal lifecycle — voluntary leave + host kick via soft-delete `leftAt` / `removedBy` | Accepted |
| [0037](0037-self-hosted-runner-pool-covers-all-non-health-jobs.md) | Self-hosted runner pool covers all CI/CD jobs except `runner-health.yml` (extends ADR-0029 + ADR-0032) | Proposed |
| [0038](0038-biome-oxlint-lefthook-tooling.md) | Code-quality tooling — Biome (format) + Oxlint (lint) + lefthook (pre-commit) + ratcheted TS strictness | Accepted |
| [0039](0039-desktop-responsive-layout.md) | Desktop-responsive layout — breakpoint-conditional surface modes, capped containers, popover menus, centered modals | Accepted |

## When to write an ADR

High bar. Only write one for **structural** decisions:

- Stack changes (add/remove a technology).
- Yjs doc shape, sync protocol, or relay responsibilities.
- Identity, sessions, rooms, access control, host election, snapshots.
- Deployment topology, repo layout.
- Reversal of a prior ADR.

**Do not** write one for:
- Product / feature mechanics → `docs/project.md`, `docs/schema.md`, `docs/ux.md`.
- Tooling, lint, formatter, pre-commit hooks → `CONTRIBUTING.md`.
- Config constants, library defaults, small refinements of existing ADRs.
- Implementation details of an already-decided architecture.

If unsure, default to **not** writing one. ADRs are for decisions a future contributor would otherwise have to excavate; everything else is documentation, not architecture.
