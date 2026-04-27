# ADR-0014: Repo layout — pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

hnch has two deliverables: an Angular + Ionic + Capacitor client (PWA + iOS + Android) and a Node.js y-websocket relay. These ship independently — the client to app stores and a static host, the relay to a small Node runtime — but they share a small surface:

- Room code format and validation (ADR-0008): generation regex, look-alike character exclusions, display formatting.
- Access control on-the-wire shapes (ADR-0009): join handshake, password challenge format, invite token payload shape.
- Shared TypeScript tooling config (ESLint, Prettier, base tsconfig) where it makes sense.

The Yjs doc schema (ADR-0013) is deliberately not shared — the relay is content-blind per ADR-0001 and never parses doc payloads.

We need to pick how to organize the source tree before any code is written, because the answer shapes build scripts, CI, imports, and how the shared surface gets consumed.

## Decision

Use a **pnpm workspaces monorepo** with three packages:

```
hnch/
├── package.json            # workspace root
├── pnpm-workspace.yaml
├── packages/
│   ├── client/             # Angular + Ionic + Capacitor app
│   ├── relay/              # Node.js y-websocket relay
│   └── shared/             # room code helpers, auth token shapes, shared types
├── adr/
├── project.md
└── CLAUDE.md
```

The `shared` package is the only cross-cutting module; `client` and `relay` both depend on it via the workspace protocol (`"@hnch/shared": "workspace:*"`). Each package keeps its own `package.json`, build scripts, and test setup — pnpm just hoists dependencies and wires up the workspace graph.

> **Note (post-acceptance):** the workspace has since added `packages/e2e` (Playwright suite — a test harness, not a shipping deliverable, added without a dedicated ADR) and `packages/cli` (`@hnch/cli` — a shipping deliverable, see [ADR-0021](0021-cli-package.md) for rationale and the package-set extension). The decision recorded here is unchanged.

No Nx, no Turborepo, no Lerna. If task-graph features become worth the overhead later, Nx can be layered on top of existing pnpm workspaces without restructuring.

## Options Considered

### Option A: pnpm workspaces monorepo (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None beyond pnpm itself |
| Feature set | Minimal but sufficient |
| Team familiarity | Standard |

**Pros:** atomic commits across client, relay, and shared (wire-protocol changes land as one reviewable unit); one lockfile to reason about; the workspace protocol makes `@hnch/shared` consumable as a normal dependency without publishing; no generator/executor layer to learn; pnpm is fast and disk-efficient; escape hatch is easy — any package can be extracted to its own repo later with minimal surgery.
**Cons:** no built-in task graph or affected-graph logic (scripts are manual `pnpm -r run build` or per-package invocations); no remote build cache; not much help orchestrating CI beyond running each package's scripts.

### Option B: Nx monorepo

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | Conceptual overhead + optional Nx Cloud fees for remote cache |
| Feature set | Rich — affected graph, generators, executors, caching |
| Team familiarity | Low (solo dev, not used previously) |

**Pros:** strong Angular integration (Nx originated in the Angular ecosystem); affected-graph lets CI rebuild/retest only what changed; local + remote task caching; opinionated generators for new libs/apps; module boundary rules enforceable via lint.
**Cons:** most of the features that justify Nx (affected-graph savings across many libs, enforced cross-team boundaries, Nx Cloud cache) do not pay off at two projects with one developer; `project.json`/executor/target layer adds a conceptual tax on top of plain npm scripts; Capacitor build steps (`cap sync`, `cap run ios`) don't map cleanly to Nx executors without the Nx Capacitor plugin, adding another layer; harder to extract a package to its own repo later.

### Option C: Two separate repos (hnch-client, hnch-relay)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Duplicated tooling config per repo |
| Feature set | N/A — no shared tooling |
| Team familiarity | Standard |

**Pros:** each repo has a crisp scope; CI config is fully independent; no workspace tooling at all.
**Cons:** the small shared surface (room code helpers, auth token shapes) has to be either duplicated or extracted into a published micro-package — both annoying for a tiny amount of code; changes that touch the wire protocol span two PRs in two repos and cannot be reviewed atomically; version drift between client and relay becomes a real risk; duplicated eslint/prettier/tsconfig setup.

### Option D: Single repo, flat folders, no workspace tooling

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Cost | None |
| Feature set | None |
| Team familiarity | Standard |

**Pros:** zero tooling to set up; just two folders with their own `package.json` each.
**Cons:** no clean way to share code — either duplicate the shared helpers or relative-import across folders (`../../relay/src/...`), both ugly; two separate `node_modules` trees duplicate dependencies on disk; impossible to express the client-depends-on-shared relationship cleanly. Viable for the first week but collapses as soon as the shared surface grows beyond one file.

## Trade-off Analysis

pnpm workspaces is the smallest amount of tooling that correctly expresses the problem: three packages, one with a dependency arrow pointing at a shared one. That's it. Everything else either under-serves (Options C and D — no clean sharing) or over-serves (Option B — features we won't use at this scale).

Nx is a reasonable default when you already have five or more packages, multiple contributors, and a CI pipeline that would benefit from affected-graph savings. None of those apply here. Picking Nx now would be optimizing for a hypothetical future shape rather than the real one. And critically, Nx can be added on top of an existing pnpm workspace later — the migration path is well-trodden — so we are not closing any doors.

Two separate repos is defensible given how little the projects share, but the "duplicate or publish a micropackage" dilemma for room code helpers and auth shapes is worse than just living in one repo with a shared package. Version drift between a client and its relay — where the wire protocol is the shared surface — is the kind of bug that's hard to catch in CI and easy to ship.

## Consequences

**Easier:**
- Client and relay stay in lockstep on the wire protocol — any change that touches the handshake is one PR.
- The `packages/shared` module has a natural home, imported as `@hnch/shared` from either package without publishing.
- One `pnpm install` at the root sets up everything.
- CI can run `pnpm -r run lint && pnpm -r run test && pnpm -r run build` for the whole tree, or target a single package.

**Harder:**
- No affected-graph support — CI rebuilds everything on every push unless we add that logic manually. At current scale, this is fine; a full build of both packages is fast.
- Capacitor's native build steps (`cap sync`, `cap run ios/android`) need to be invoked from inside `packages/client` or via a root script that `cd`s — not a pnpm problem, but a reminder that Capacitor has opinions about where it runs.
- Contributors need to remember to run pnpm (not npm or yarn) — we enforce this with the `packageManager` field in the root `package.json` and a preinstall guard if needed.

**Revisit triggers:**
- Adding a third or fourth package (admin dashboard, telemetry service, marketing site) where task-graph caching starts earning its keep → consider adding Nx or Turborepo on top of existing workspaces.
- Shared surface growing past ~500 LOC or gaining complex internal structure → same trigger.
- CI run times becoming painful due to full-graph rebuilds → add affected-graph logic (via Nx or a lightweight alternative like `turbo`).
- Needing to publish the relay or shared helpers as a standalone npm package → pnpm handles this natively via `pnpm publish --filter`.

## Action Items

- [ ] Initialize the repo layout: root `package.json` with `"packageManager": "pnpm@<version>"`, `pnpm-workspace.yaml` declaring `packages/*`, and empty `packages/client`, `packages/relay`, `packages/shared` scaffolds.
- [ ] Scaffold `packages/client` using `ionic start` with the Angular template (Action Item from ADR-0002).
- [ ] Scaffold `packages/relay` as a minimal TypeScript Node.js project.
- [ ] Define `packages/shared` as `@hnch/shared` with an initial export surface for room code helpers (ADR-0008) and auth token shapes (ADR-0009).
- [ ] Wire a root-level `pnpm lint`, `pnpm test`, and `pnpm build` via `pnpm -r run <script>`.
- [ ] Add a preinstall guard or `only-allow pnpm` to the root to prevent accidental npm/yarn usage.
