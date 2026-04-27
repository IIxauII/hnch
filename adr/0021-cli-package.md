# ADR-0021: CLI package — fourth deliverable with parity contract and platform-appropriate divergences

**Status:** Proposed
**Date:** 2026-04-26
**Deciders:** Xau

## Context

The original deliverables for hnch were the Angular + Ionic + Capacitor client and the Node.js y-websocket relay ([ADR-0001](0001-networking-crdt-over-relay.md), [ADR-0014](0014-repo-layout-pnpm-workspaces.md)). A Playwright e2e package was added later under `packages/e2e` ([ADR-0014](0014-repo-layout-pnpm-workspaces.md)'s implicit extension). A CLI client (`packages/cli`, `@hnch/cli`) has now been scaffolded as a fourth shipping surface, targeting developers and automation users who prefer a terminal workflow and serving as a parity smoke-test client against the same relay and protocol the mobile client uses (see [`cli.md`](../cli.md)).

The CLI is a real Node.js process, not a WebView. Several decisions that were correct for the Capacitor client do not apply, or apply differently, in this environment:

- **Persistence ([ADR-0004](0004-local-persistence-sqlite-indexeddb.md)):** the entire reason that ADR exists is the WKWebView 7-day eviction problem. There is no WebView in a CLI process, and SQLite-via-Capawesome is a Capacitor plugin, not consumable from plain Node.
- **Identity ([ADR-0005](0005-device-identity-capacitor-device-plugin.md)):** the Capacitor Device plugin requires a Capacitor runtime. There is no `Device.getId()` to call from a Node CLI.
- **Repo layout ([ADR-0014](0014-repo-layout-pnpm-workspaces.md)):** that ADR enumerated three packages — `client`, `relay`, `shared`. With `e2e` already present and `cli` now scaffolded, the workspace has five packages.

The protocol surface — Yjs doc schema, room code format, password hashing, relay handshake, host election, reveal logic, scales — must remain identical to the mobile client. The CLI's value is precisely that it is the same client speaking the same wire protocol from a different runtime; any feature delta would defeat the parity smoke-test purpose and risk silent divergence between the two clients.

This ADR records the CLI's existence as a deliverable, declares its parity contract with the mobile client, and documents the two narrow divergences from prior ADRs that the Node-runtime environment forces. The actual command surface (`hnch create`, `hnch join`, `hnch resume`, `hnch config`) and source layout are documented in [`cli.md`](../cli.md); this ADR is concerned only with the structural decisions a reasonable contributor could have made differently.

## Decision

1. **Add `packages/cli` (`@hnch/cli`) as a fourth deliverable** alongside `client`, `relay`, and `e2e`. The CLI uses Ink (React for terminal) for rendering and yargs for argument parsing; it depends on `@hnch/shared` for protocol types via `workspace:*`.

2. **Parity contract.** The CLI MUST use the same `@hnch/shared` Yjs doc schema, the same `hashPassword()` implementation, the same relay handshake (`GET /rooms/:code` → `WS /ws/:uuid?did=...&pw=...`) and the same room-code format as the mobile client. Core session behavior — rounds ([ADR-0013](0013-round-model-flat-parentroundid.md)), voting and reveal ([ADR-0018](0018-remove-timer-add-unanimous-reveal.md), [ADR-0020](0020-participant-viewer-voter-role.md)), host election ([ADR-0010](0010-host-election.md)), access control ([ADR-0009](0009-access-control-relay-tokens.md), [ADR-0017](0017-password-hashing-drop-invite-only.md)), scale customization ([ADR-0019](0019-scale-customization.md)) — has no feature delta with the mobile client. New protocol features land on both clients in lockstep or are rejected.

3. **Identity divergence from [ADR-0005](0005-device-identity-capacitor-device-plugin.md).** The CLI generates its own UUID on first run (Node's `crypto.randomUUID()`) and persists it as the `participantId` field inside `~/.config/hnch/config.json`. It does not call the Capacitor Device plugin. The semantic role of the identifier — peer ID for host election, returning-participant recognition — is unchanged; only the source of the bytes differs. This is exactly the "Option B: self-generated UUID" branch that ADR-0005 considered and chose against for mobile, but it is the only viable option in a Node runtime. **Multi-host config copy** (a user `rsync`-ing their `~/.config/hnch/` between machines) tolerates collisions: the relay is content-blind ([ADR-0001](0001-networking-crdt-over-relay.md)) and treats the device ID as opaque, so two machines briefly presenting the same UUID is at worst a UX oddity (host election can pick either, awareness shows one combined identity); we do not detect or prevent it.

4. **Persistence divergence from [ADR-0004](0004-local-persistence-sqlite-indexeddb.md).** CLI configuration — including the `participantId` device-identity field — and the last-session cache are stored as plain JSON files under `~/.config/hnch/` (`config.json`, `last-session.json`). The Yjs doc itself is held in memory for the lifetime of the CLI process and is not persisted to disk between invocations — the relay's 24-hour snapshot ([ADR-0012](0012-snapshot-policy.md)) carries continuity for `hnch resume` rather than a local doc store. There is no WKWebView eviction concern in a Node process, and SQLite-via-Capawesome is unavailable; flat JSON files are the smallest tooling that fits the CLI's needs. This relaxes [ADR-0004](0004-local-persistence-sqlite-indexeddb.md)'s implicit PWA-vs-native split assumption — a third runtime (Node TTY) joins the matrix and brings a third storage choice.

5. **Repo layout extension to [ADR-0014](0014-repo-layout-pnpm-workspaces.md).** ADR-0014's "three packages" enumeration (`client`, `relay`, `shared`) is relaxed to allow additional packages that follow the same workspace conventions — currently `e2e` (Playwright) and `cli`. The shared package remains the only cross-cutting protocol module; new packages depend on it via `workspace:*` exactly as `client` and `relay` do. The pnpm-workspace tooling, lockfile, and `pnpm -r` scripts already accommodate this without further configuration.

## Options Considered

### Option A: CLI as a fourth deliverable in the same monorepo (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Parity risk | Low — single source of truth in `@hnch/shared` |
| Release cohesion | High — protocol changes land atomically |
| Team familiarity | Standard pnpm workspace |

**Pros:** parity smoke-test against the same `@hnch/shared` types; a wire-protocol change is one PR that updates both clients and the relay; release versioning stays cohesive; no separate repo to keep in sync; the existing pnpm workspace already handles N packages, no tooling change needed.
**Cons:** monorepo build surface grows; CI runs CLI tests on every PR even when only mobile changed (acceptable at current scale per [ADR-0014](0014-repo-layout-pnpm-workspaces.md)).

### Option B: CLI in a separate repo, depending on a published `@hnch/shared`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Parity risk | High — version skew between clients becomes possible |
| Release cohesion | Low — protocol changes need coordinated releases |
| Team familiarity | Standard |

**Pros:** clean repo scope; CI is independent; CLI contributors don't need the mobile toolchain.
**Cons:** the parity contract (the entire reason the CLI exists as a smoke-test client) is undermined by version skew between a published `@hnch/shared` and what the mobile client uses from `workspace:*`; wire-protocol changes are a two-PR coordination dance across repos — exactly the failure mode [ADR-0014](0014-repo-layout-pnpm-workspaces.md) cited against the two-repo option for `client`/`relay`.

### Option C: No CLI; mobile + relay only

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Parity smoke-test | None |
| Automation/dev workflows | Not served |

**Pros:** smaller surface; less code to maintain; matches the original [ADR-0014](0014-repo-layout-pnpm-workspaces.md) shape exactly.
**Cons:** loses the parity smoke-test client (mobile bugs in protocol code can hide behind Ionic UI quirks until users report them); no terminal workflow for developers and automation users; the CLI was already scaffolded based on real demand for these workflows.

## Trade-off Analysis

Option A is the same trade-off [ADR-0014](0014-repo-layout-pnpm-workspaces.md) made for `client` and `relay`, applied consistently: the wire protocol is the shared surface, and version skew on a shared surface is the kind of bug that's hard to catch in CI and easy to ship. Pulling the CLI out of the monorepo would re-introduce exactly that risk for no offsetting benefit at current team size (one developer).

The two divergences from earlier ADRs (identity in [ADR-0005](0005-device-identity-capacitor-device-plugin.md), persistence in [ADR-0004](0004-local-persistence-sqlite-indexeddb.md)) are not reversals of those decisions — those ADRs remain correct for the Capacitor runtime they target. The divergences are environmental: the Capacitor APIs those ADRs depend on are not reachable from a Node process, and the WKWebView constraint that motivated [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) does not exist in a Node process. Recording the divergences here keeps the original ADRs honest about their scope ("on Capacitor") and gives the CLI's choices an explicit justification rather than appearing as silent drift.

The relaxation of [ADR-0014](0014-repo-layout-pnpm-workspaces.md) is a clarification rather than a real change — that ADR's machinery (pnpm workspaces, `workspace:*`, root scripts) was always n-package-capable; the "three packages" wording in its Decision section was descriptive of what existed at the time, not prescriptive about what could exist later. `packages/e2e` already lives outside that enumeration without controversy; `packages/cli` is treated the same way.

The honest cost: every protocol change now has to land in two clients, not one. For the parity contract to hold, both clients need to be updated together or the change is incomplete. This is a discipline cost, not a tooling cost — `pnpm -r run test` will catch most regressions, and the e2e suite exercises both clients against the same relay.

## Consequences

**Easier:**
- A second client validates the relay protocol from a different runtime — protocol bugs that hide behind Ionic-specific quirks are more likely to surface.
- Developers and automation users get a terminal workflow without launching a phone or simulator.
- Scale customization, password protection, and host election all gain a non-Capacitor consumer, which exercises `@hnch/shared` more thoroughly.

**Harder:**
- Wire-protocol changes must land in both clients. A change that lands only in the mobile client is incomplete and breaks the parity contract.
- The monorepo grows; full CI runs are longer.
- CLI-specific dependencies (Ink, React-for-terminal, yargs) bring a non-trivial install footprint into the workspace, even for contributors only working on mobile.

**Revisit triggers:**
- The parity contract becomes burdensome (e.g., a mobile-only feature is repeatedly forced through the CLI for protocol parity even though the CLI has no use for it). At that point we'd write a new ADR that narrows the parity scope to wire-protocol surface only and explicitly excludes UX features.
- The CLI gains capabilities that are genuinely platform-specific (e.g., shell-script integration, scriptable output formats) that don't have mobile analogues. Those would need a new ADR to define a platform-specific surface that doesn't compromise wire-protocol parity.
- A second non-Capacitor consumer of `@hnch/shared` appears (e.g., a server-side bot, a CI integration) and the divergence patterns from [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) and [ADR-0005](0005-device-identity-capacitor-device-plugin.md) need generalizing into a "non-Capacitor runtime" appendix or a dedicated ADR.
- The CLI is extracted to its own repo for distribution reasons (e.g., npm publish lifecycle distinct from mobile releases). At that point Option B's trade-offs need to be re-evaluated against the parity-contract risk.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" to mention the CLI as a fourth deliverable and reference this ADR for the divergences.
- [ ] Cross-link from [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) and [ADR-0005](0005-device-identity-capacitor-device-plugin.md) to this ADR (typo-class additions, not body rewrites) so future readers landing on those ADRs see that the CLI runtime takes a different path.
- [ ] Cross-link from [ADR-0014](0014-repo-layout-pnpm-workspaces.md) to this ADR noting that the package enumeration has been extended.
- [ ] Add a workspace-level lint or test that fails if the CLI's `@hnch/shared` import is replaced with a local re-implementation of any protocol type — the parity contract needs to be enforced, not just documented.
