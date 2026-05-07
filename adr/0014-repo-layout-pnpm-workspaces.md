# ADR-0014: Repo layout — pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Two deliverables: Angular+Ionic+Capacitor client, Node.js y-websocket relay. Ship independently.
- Small shared surface: room code format/validation (ADR-0008), wire-protocol auth shapes (ADR-0009), shared TS tooling.
- Yjs doc schema deliberately NOT shared — relay content-blind per ADR-0001.
- Layout choice shapes build scripts, CI, imports, shared-surface consumption.

## Decision

pnpm workspaces monorepo with `packages/client`, `packages/relay`, `packages/shared`. Client and relay depend on shared via workspace protocol (`"@hnch/shared": "workspace:*"`). No Nx/Turborepo/Lerna — can layer on later without restructuring.

> Post-acceptance: workspace later added `packages/e2e` (Playwright harness, no dedicated ADR) and `packages/cli` (shipping deliverable, [ADR-0021](0021-cli-package.md)). Decision unchanged.

## Options

- **A — pnpm workspaces (chosen):** atomic cross-package commits; one lockfile; workspace protocol; pnpm fast/disk-efficient; easy escape hatch to extract package later. Cons: no built-in task graph or remote cache; manual `pnpm -r` orchestration.
- **B — Nx monorepo:** affected-graph CI savings; generators; module-boundary lint. Cons: features don't pay off at 2 packages/1 dev; project.json/executor tax; Capacitor steps don't map cleanly without Nx Capacitor plugin; harder to extract later.
- **C — Two separate repos:** crisp scopes, independent CI. Cons: shared surface must be duplicated or published as micropackage; wire-protocol changes span 2 PRs (no atomic review); version-drift risk; duplicated tooling.
- **D — Single repo, flat folders, no workspace:** zero tooling. Cons: no clean sharing — duplicate or `../../relay/src/...` relative imports; duplicated `node_modules`; collapses as shared surface grows.

## Trade-offs

- No affected-graph → CI rebuilds everything per push (fine at current scale).
- Capacitor native steps (`cap sync`, `cap run`) must run from `packages/client` or root script with `cd`.
- Contributors must use pnpm — enforce via `packageManager` field + preinstall guard.

## Consequences

- Easier: client/relay lockstep on wire protocol (one PR); `@hnch/shared` consumed without publishing; one `pnpm install`; CI runs `pnpm -r run <script>`.
- Harder: full-graph rebuilds in CI; Capacitor location coupling; pnpm-only enforcement.
- Revisit when: 3rd/4th package added; shared surface > ~500 LOC; CI times painful → add Nx/Turborepo on top; or need to publish shared/relay → `pnpm publish --filter` already supports.

## Action Items

- [ ] Root `package.json` with `packageManager: "pnpm@<version>"`, `pnpm-workspace.yaml` declaring `packages/*`.
- [ ] Scaffold `packages/client` via `ionic start` Angular template (per ADR-0002).
- [ ] Scaffold `packages/relay` minimal TS Node project.
- [ ] Define `@hnch/shared` exports: room code helpers (ADR-0008) + auth shapes (ADR-0009).
- [ ] Root `pnpm lint`/`test`/`build` via `pnpm -r run`.
- [ ] `only-allow pnpm` preinstall guard.
