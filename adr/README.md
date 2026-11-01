# Architecture Decision Records

This folder holds the architectural decisions for hnch. Each ADR captures *why* a choice was made, what alternatives were considered, and what the trade-offs are. Project features and product scope live in `project.md`; this folder is for structural and technical decisions where a reasonable person could have chosen differently.

## Conventions

**Numbering:** sequential, four-digit, zero-padded. Numbers may be reused only after a deletion leaves a gap; otherwise once assigned, never reused. Filenames follow the pattern `NNNN-kebab-case-title.md`.

**Status values:** the in-file `**Status:**` header carries a bare value — `Proposed`, `Accepted`, `Superseded by ADR-XXXX`, or `Deprecated`. The Index Status column collapses to the bare word `{Proposed / Accepted / Superseded / Deprecated}`; the supersession pointer moves to its own `Superseded by` column.
- **Proposed** — under discussion, not yet accepted.
- **Accepted** — decision is in effect.
- **Superseded by ADR-XXXX** — a later ADR fully replaces this one. Index Status `Superseded`, column = bare `ADR-XXXX`. Superseded ADRs may be deleted once the superseding ADR stands alone; if kept, retain as historical reference.
- **Deprecated** — no longer applies but not actively replaced (rare).
- **Partial supersession** — when only one clause of an otherwise-live decision is replaced, the header stays `Accepted (<clause> superseded by ADR-XXXX)` — one short parenthetical, never paragraph-length prose — and the Index column shows `ADR-XXXX (partial)`. "Refines"/"extends" relationships are not supersessions and stay out of the column.

**Immutability:** once an ADR is Accepted, its body is not edited to reflect a change of direction. A new ADR is written that supersedes it. Small corrections (typos, broken links, clarifications, editorial compaction without altering the decision, status-line/supersession-caveat edits) are fine; substantive change requires a new ADR.

**Consolidation-forward:** partial-supersede chains rot — current state scatters across many ADRs. When EITHER a single topic needs 3+ ADRs to reconstruct its current state from accreted partial supersedes, OR one ADR carries 2+ partial-supersede caveats, consider rewriting forward: a fresh standalone ADR that fully restates current state, after which the consolidated ADRs are marked fully `Superseded by ADR-XXXX`. Judgment guideline, not an auto-trigger — consolidate once the chain genuinely impairs reasoning, not on hitting the count. (ADR-0049 consolidated the 0032/0033/0037/0047 runner chain this way.)

**Style:** terse, bullet-driven. Caveman-ultra: drop articles, filler, hedging — keep technical terms exact. Sections, in order: Context (bullets), Decision (1–2 sentences), Trade-offs (bullets), Consequences (Easier/Harder/Revisit-when bullets). **No Options/Alternatives section** — rejected paths belong in commit/PR discussion, not in the durable ADR. **No Action Items / phase checklists / implementation phases** — track those in the PR or in issues. The ADR captures the decision and what it costs us; nothing else.

**Template:** see `0000-template.md` — copy it to start a new ADR.

**Index:** every new ADR adds its row to the [Index](#index) below in the same PR. A status change or supersession updates the existing row.

## Index

| # | Title | Status | Superseded by |
|---|---|---|---|
| [0001](0001-networking-crdt-over-relay.md) | Networking — CRDT sync over a content-blind relay | Accepted |  |
| [0002](0002-frontend-framework-angular-ionic-capacitor.md) | Frontend framework — Angular + Ionic + Capacitor | Accepted |  |
| [0003](0003-state-sync-yjs.md) | State sync — Yjs CRDT library | Accepted |  |
| [0004](0004-local-persistence-sqlite-indexeddb.md) | Local persistence — Capawesome SQLite (native) + IndexedDB (PWA) | Accepted |  |
| [0005](0005-device-identity-capacitor-device-plugin.md) | Device identity via the Capacitor Device plugin | Accepted |  |
| [0006](0006-ephemeral-sessions.md) | Sessions are ephemeral (one per meeting) | Accepted |  |
| [0007](0007-teams-local-only.md) | Teams as a local-only layered concept | Accepted |  |
| [0008](0008-room-code-format.md) | Room code format and lifecycle | Accepted |  |
| [0009](0009-access-control-relay-tokens.md) | Access control enforced at the relay via opaque tokens | Accepted |  |
| [0010](0010-host-election.md) | Host election mechanics | Accepted |  |
| [0012](0012-snapshot-policy.md) | Ephemeral room snapshot policy | Accepted | ADR-0051 (partial) |
| [0013](0013-round-model-flat-parentroundid.md) | Round model — flat list with parentRoundId linking | Superseded | ADR-0046 |
| [0014](0014-repo-layout-pnpm-workspaces.md) | Repo layout — pnpm workspaces monorepo | Accepted |  |
| [0016](0016-client-relay-connection-handshake.md) | Client ↔ relay connection handshake | Accepted |  |
| [0017](0017-password-hashing-drop-invite-only.md) | Password hashing scheme and invite-only removal | Accepted | ADR-0035 (partial), ADR-0051 (partial) |
| [0018](0018-remove-timer-add-unanimous-reveal.md) | Remove countdown timer; add unanimous auto-reveal | Accepted |  |
| [0019](0019-scale-customization.md) | Scale customization — builtin presets, sentinel removal, device-local overrides | Accepted |  |
| [0020](0020-participant-viewer-voter-role.md) | Participant Viewer/Voter Role | Accepted |  |
| [0021](0021-cli-package.md) | CLI package — fourth deliverable with parity contract and platform-appropriate divergences | Accepted |  |
| [0022](0022-last-session-cache.md) | Last-session cache — TTL aligned to relay snapshot | Superseded | ADR-0044 |
| [0023](0023-session-end-broadcast.md) | Session-end-for-everyone — host-written doc broadcast | Accepted |  |
| [0024](0024-participant-cap.md) | Participant cap — 20-peer hard limit, relay-enforced | Accepted |  |
| [0025](0025-reconnect-backoff.md) | Reconnect / backoff posture — y-websocket defaults plus `online` reset | Accepted |  |
| [0026](0026-deep-link-url-format.md) | Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX` | Accepted | ADR-0031 (partial) |
| [0027](0027-test-only-relay-surfaces.md) | Test-only relay surfaces — `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` | Accepted | ADR-0051 (partial) |
| [0028](0028-telemetry-posture.md) | Telemetry / analytics posture — none in v1 | Accepted |  |
| [0029](0029-relay-deployment.md) | Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout | Superseded | ADR-0051 |
| [0031](0031-runtime-origin-for-invite-urls.md) | Runtime `window.location.origin` for invite URLs (supersedes ADR-0026 §1) | Accepted |  |
| [0034](0034-qr-scan-native-web-split.md) | QR scan native-vs-web split — single plugin, runtime platform branch, lazy ZXing-WASM polyfill on web | Accepted |  |
| [0035](0035-wrong-password-post-upgrade-close.md) | Wrong-password rejection on WS close 4002 (supersedes ADR-0017 password-enforcement clause) | Accepted |  |
| [0036](0036-participant-removal-lifecycle.md) | Participant removal lifecycle — voluntary leave + host kick via soft-delete `leftAt` / `removedBy` | Accepted |  |
| [0040](0040-skipped-rounds.md) | Skipped rounds — host terminal-state action distinct from reveal | Accepted |  |
| [0041](0041-per-round-abstain-sentinel.md) | Per-round abstain action for voters — `hnch_abstain` sentinel, auto-reveal amendment | Accepted |  |
| [0042](0042-pre-session-agenda.md) | Pre-session story agenda — `agenda: Y.Array<Y.Map>` + `round.agendaItemId` backref | Superseded | ADR-0045 |
| [0043](0043-per-participant-avatar-color.md) | Per-participant avatar color — user-selectable palette or hex, stored on participant record | Accepted |  |
| [0044](0044-local-room-history-cache.md) | Local room history cache — per-room entries, mobile passwordHash reversal | Accepted |  |
| [0045](0045-agenda-consume-at-round-terminal.md) | Agenda items consume at round-terminal (reveal/skip) instead of round-start (supersedes ADR-0042) | Accepted |  |
| [0046](0046-round-discard-tombstone.md) | Round record — three terminal fields (`revealedAt`/`skippedAt`/`discardedAt`) + tombstone semantics (supersedes ADR-0013) | Accepted |  |
| [0048](0048-host-election-eligible-peer-set.md) | Host election eligible peer set — online ∩ active, single-sourced in `shared/election.ts` (refines ADR-0010) | Accepted |  |
| [0049](0049-self-hosted-runner-pool-current-state-consolidation.md) | Self-hosted runner pool — current-state consolidation | Superseded | ADR-0056 |
| [0050](0050-reconnect-reconciliation.md) | Reconnect reconciliation — presence re-announce, sync-gated auto-reveal, HTTP refusal lookup | Accepted |  |
| [0051](0051-cloudflare-hosting.md) | Hosting — Cloudflare Workers and Durable Objects replace the IONOS VPS | Accepted | ADR-0054 (partial) |
| [0052](0052-single-e2e-runner-slot.md) | Single `e2e` runner slot — one Playwright job at a time on the pool (refines ADR-0049) | Superseded | ADR-0056 |
| [0053](0053-runner-pool-two-slots.md) | Runner pool size — 2 slots, fewer than the verify lanes | Superseded | ADR-0056 |
| [0054](0054-vps-decommission.md) | VPS decommission — deploy path removed now, box shut down after the switch (partially supersedes ADR-0051) | Accepted |  |
| [0055](0055-verified-skip-main-push-run.md) | Verified-skip — a main push run may pass on a green PR run for the identical tree | Accepted |  |
| [0056](0056-github-hosted-runners.md) | GitHub-hosted runners for all CI/CD — self-hosted pool retired (supersedes ADR-0049, ADR-0052, ADR-0053) | Accepted |  |
| [0057](0057-screenshot-reference-on-the-screenshots-branch.md) | Screenshot reference set — captured in main's e2e run, stored on the `screenshots` branch | Accepted |  |

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

When a proposed code change conflicts with an existing ADR, either conform the change to the ADR or draft the superseding ADR first and get agreement before implementing — never silently land a change that contradicts an Accepted ADR.
