# ADR-0021: CLI package — fourth deliverable with parity contract

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Original deliverables: Capacitor client + Node y-websocket relay (ADR-0001, ADR-0014). `packages/e2e` added later.
- CLI (`packages/cli`, `@hnch/cli`) now scaffolded as fourth surface — terminal workflow + parity smoke-test against same relay/protocol. See `cli.md`.
- Node runtime breaks two prior ADRs:
  - ADR-0004 (SQLite/IndexedDB): targets WKWebView eviction; no WebView in Node, Capawesome unavailable.
  - ADR-0005 (Capacitor Device plugin): plugin requires Capacitor runtime.
- ADR-0014 enumerated three packages; `e2e` already extended that, `cli` extends further.
- Wire protocol surface (doc schema, room codes, password hashing, handshake, host election, reveal, scales) MUST stay identical — parity is the value.

## Decision

1. Add `packages/cli` as fourth deliverable. Ink + yargs; depends on `@hnch/shared` via `workspace:*`.
2. **Parity contract:** same `@hnch/shared` types, `hashPassword()`, handshake (`GET /rooms/:code` → `WS /ws/:uuid?did&pw`), room-code format. Behavior parity with mobile across ADR-0009/0010/0013/0017/0018/0019/0020. Protocol features land in lockstep on both clients.
3. **Identity divergence (ADR-0005):** CLI generates UUID via Node `crypto.randomUUID()`, persists in `~/.config/hnch/config.json` as `participantId`. Semantic role unchanged; only byte source differs. Multi-host config copy tolerated — relay content-blind, ID opaque.
4. **Persistence divergence (ADR-0004):** plain JSON files under `~/.config/hnch/` (`config.json`, `last-session.json`). Yjs doc in-memory only; relay's 24h snapshot (ADR-0012) carries continuity for `hnch resume`. No WKWebView concern in Node.
5. **Repo layout (ADR-0014):** "three packages" wording relaxed; `e2e` + `cli` join via same `workspace:*` conventions.

## Trade-offs

- Every protocol change must land in both clients — discipline cost, not tooling cost (`pnpm -r run test` + e2e catch most).
- Monorepo build/CI longer; Ink/React-for-terminal install footprint affects mobile-only contributors.
- Divergences from ADR-0004/ADR-0005 are environmental, not reversals — those ADRs remain correct for Capacitor.

## Consequences

- Easier: second runtime exercises `@hnch/shared` + relay; terminal workflow without simulator; protocol bugs surface across two clients.
- Harder: lockstep protocol updates; bigger workspace; CLI deps in install graph.
- Revisit when: parity contract becomes burdensome (mobile-only feature forced through CLI) → narrow parity to wire-protocol only; CLI gains genuinely platform-specific surfaces; second non-Capacitor consumer appears (generalize divergence patterns); CLI extracted to own repo.
