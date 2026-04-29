# Architecture Decision Records

This folder holds the architectural decisions for hnch. Each ADR captures *why* a choice was made, what alternatives were considered, and what the trade-offs are. Project features and product scope live in `project.md`; this folder is for structural and technical decisions where a reasonable person could have chosen differently.

## Conventions

**Numbering:** sequential, four-digit, zero-padded. Once assigned, a number is never reused. Filenames follow the pattern `NNNN-kebab-case-title.md`.

**Status values:**
- **Proposed** — under discussion, not yet accepted.
- **Accepted** — decision is in effect.
- **Deprecated** — no longer applies but not actively replaced (rare).
- **Superseded by ADR-XXXX** — a later ADR replaces this one. The superseded ADR is never deleted — the history is the point.

**Immutability:** once an ADR is Accepted, its body is not edited to reflect a change of direction. A new ADR is written that supersedes it. Small corrections (typos, broken links, clarifications) are fine; substantive change requires a new ADR.

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
| [0011](0011-timer-authority.md) | Timer canonical time authority | Superseded by ADR-0018 |
| [0012](0012-snapshot-policy.md) | Ephemeral room snapshot policy | Accepted |
| [0013](0013-round-model-flat-parentroundid.md) | Round model: flat list with parentRoundId linking | Accepted |
| [0014](0014-repo-layout-pnpm-workspaces.md) | Repo layout: pnpm workspaces monorepo | Accepted |
| [0015](0015-v1-scope-session-level-reveal-and-timer.md) | v1 scope: session-level reveal mode and timer duration | Superseded by ADR-0018 |
| [0016](0016-client-relay-connection-handshake.md) | Client ↔ relay connection handshake | Accepted |
| [0017](0017-password-hashing-drop-invite-only.md) | Password hashing scheme and invite-only removal | Accepted |
| [0018](0018-remove-timer-add-unanimous-reveal.md) | Remove countdown timer; add unanimous auto-reveal | Accepted |
| [0019](0019-scale-customization.md) | Scale customization — builtin presets, sentinel removal, device-local overrides | Accepted |
| [0020](0020-participant-viewer-voter-role.md) | Participant Viewer/Voter Role | Accepted |
| [0021](0021-cli-package.md) | CLI package — fourth deliverable with parity contract and platform-appropriate divergences | Proposed |
| [0022](0022-last-session-cache.md) | Last-session cache — TTL aligned to relay snapshot | Proposed |
| [0023](0023-session-end-broadcast.md) | Session-end-for-everyone — host-written doc broadcast | Proposed |
| [0024](0024-participant-cap.md) | Participant cap — 20-peer hard limit, relay-enforced | Proposed |
| [0025](0025-reconnect-backoff.md) | Reconnect / backoff posture — y-websocket defaults plus `online` reset | Proposed |
| [0026](0026-deep-link-url-format.md) | Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX` | Proposed (origin clause superseded by ADR-0031) |
| [0027](0027-test-only-relay-surfaces.md) | Test-only relay surfaces — `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` | Proposed |
| [0028](0028-telemetry-posture.md) | Telemetry / analytics posture — none in v1 | Proposed |
| [0029](0029-relay-deployment.md) | Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout | Proposed |
| [0031](0031-runtime-origin-for-invite-urls.md) | Runtime `window.location.origin` for invite URLs (supersedes ADR-0026 §1) | Accepted |
| [0032](0032-self-hosted-github-actions-runner.md) | Self-hosted GitHub Actions runner — ephemeral arm64 Podman pool on Mac mini M4 (Tart deferred) | Proposed |
| [0033](0033-runner-image-from-debian-and-actions-runner-tarball.md) | Runner image from `debian:bookworm-slim` + official `actions/runner` tarball (refines ADR-0032 §base-image) | Proposed |

## When to write an ADR

Write one whenever you make a decision that:
- A reasonable contributor could have made differently given the same constraints.
- Has downstream consequences for the system's shape, cost, privacy, or developer experience.
- Would be hard to reconstruct six months later from code alone.

Don't write one for:
- Product feature choices that belong in `project.md`.
- Trivial choices with no alternative worth naming (style, formatting, naming conventions).
- Decisions fully captured by a library's documentation.

If you're unsure, err on the side of writing it — they're cheap, and a skipped ADR is a decision you'll have to excavate from chat or commit history later.
