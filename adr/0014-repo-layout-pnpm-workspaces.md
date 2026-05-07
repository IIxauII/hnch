# ADR-0014: Repo layout — pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Two deliverables: Angular+Ionic+Capacitor client, Node.js y-websocket relay. Ship independently.
- Small shared surface: room code format/validation (ADR-0008), wire-protocol auth shapes (ADR-0009), shared TS tooling.
- Yjs doc schema deliberately NOT shared — relay content-blind per ADR-0001.
- Layout choice shapes build scripts, CI, imports, shared-surface consumption.

## Decision

pnpm workspaces monorepo with `packages/client`, `packages/relay`, `packages/shared`. Client and relay depend on shared via workspace protocol (`"@hnch/shared": "workspace:*"`). No Nx/Turborepo/Lerna — can layer on later without restructuring. Atomic cross-package commits; one lockfile; easy escape hatch to extract package later.

> Post-acceptance: workspace later added `packages/e2e` (Playwright harness, no dedicated ADR) and `packages/cli` (shipping deliverable, [ADR-0021](0021-cli-package.md)). Decision unchanged.

## Trade-offs

- No affected-graph → CI rebuilds everything per push (fine at current scale).
- Capacitor native steps (`cap sync`, `cap run`) must run from `packages/client` or root script with `cd`.
- Contributors must use pnpm — enforce via `packageManager` field + preinstall guard.

## Consequences

- Easier: client/relay lockstep on wire protocol (one PR); `@hnch/shared` consumed without publishing; one `pnpm install`; CI runs `pnpm -r run <script>`.
- Harder: full-graph rebuilds in CI; Capacitor location coupling; pnpm-only enforcement.
- Revisit when: 3rd/4th package added; shared surface > ~500 LOC; CI times painful → add Nx/Turborepo on top; or need to publish shared/relay → `pnpm publish --filter` already supports.
