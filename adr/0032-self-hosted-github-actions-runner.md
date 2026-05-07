# ADR-0032: Self-hosted GitHub Actions runner — ephemeral arm64 Podman pool on Mac mini M4 (Tart deferred)

**Status:** Accepted (scope partially superseded by ADR-0037 — extends self-hosted to release.yml, deploy-*.yml, and the residual cheap ci.yml jobs; Tart deferral and runner-health-on-ubuntu pieces stand)
**Date:** 2026-04-29

## Context

- Private repo on GitHub → 2,000 free Actions min/month (3,000 Pro).
- Minute hogs: `verify` matrix (one lane per workspace package per [ADR-0014](0014-repo-layout-pnpm-workspaces.md)) + `e2e` (Playwright Chromium). Insensitive to GitHub egress.
- Phase 6b (native iOS) needs `macos-latest` — billed 10× on private repos.
- Hardware: Mac mini M4 (10-core, 16 GB, NVMe, always-on) available; daily-driver — must stay clean.
- IONOS VPS already loaded with prod relay per [ADR-0029](0029-relay-deployment.md); 1 GB RAM total, no headroom, co-location risky.
- 2014 MacBook Air: Monterey EOL, Intel-only, RAM-bound.
- Deploy/release (`deploy-*.yml`, `release.yml`) need GitHub egress (SSH, npm publish) — pin to GitHub-hosted (note: revisited by [ADR-0037](0037-self-hosted-runner-pool-covers-all-non-health-jobs.md)).

## Decision

Run Linux CI (`verify`, `e2e`) on four ephemeral, rootless, arm64-native Podman containers on the M4, supervised by per-user `LaunchAgent`. One job per container, then destroyed. Pool size = matrix lane count. Workflow `runs-on` selected via `vars.LINUX_RUNNER` for one-command rollback. Tart-based macOS runner deferred to Phase 9, gated on 4-day p95 RAM measurement (RAM is soldered on M4).

## Options

- **A — Ephemeral arm64 Podman pool on M4 (CHOSEN):** rootless top-to-bottom; PAT only on host, 1-hour token in container; `gh variable set LINUX_RUNNER` rollback. Pros: no host pollution, arm64 native, leaves room for Tart. Cons: home-internet/M4 uptime dependency; 16 GB ceiling binds at Phase 9; PAT scoping discipline required.
- **B — IONOS VPS hosts runner:** reuse existing box. Cons: 1 GB RAM, prod co-located → swap risk, blast radius. Rejected.
- **C — 2014 MacBook Air:** dedicated. Cons: EOL OS, Intel, 4–8 GB RAM. Rejected.
- **D — actions-runner-controller (k8s):** canonical ephemeral runners. Cons: Kubernetes for one mini = order-of-magnitude overkill. Rejected.
- **E — Paid macOS-runner SaaS (Anka, Orka, EC2 Mac):** managed. Cons: $25–250/mo recurring; doesn't help Linux jobs. Rejected on cost.
- **F — Direct host install of `actions/runner` on M4:** simplest. Cons: pollutes daily-driver host, state leaks between jobs. Rejected — violates clean-host constraint.
- **G — x64 Linux containers via Rosetta:** max parity to ubuntu-latest. Cons: Rosetta CPU tax on every step; entire toolchain has arm64 builds. Rejected as default; documented as `--platform linux/amd64` escape hatch.

## Trade-offs

- New uptime dependency: home internet + M4 awake. Mitigation: `vars.LINUX_RUNNER` toggle, manual.
- 16 GB RAM ceiling becomes order-time decision before Phase 9 (Tart + iOS VM); soldered RAM.
- New credential surface: fine-grained PAT in macOS Keychain on daily-driver. Narrow scope (`Administration: Read and write` on one repo).
- More moving parts: Dockerfile + supervisor + LaunchAgent + cache layout + weekly prune + health-check workflow.

## Consequences

- Easier: Actions spend → ~100–200 min/mo; clean per-job containers; arm64 dev/CI parity; documented landing pad for Phase 9.
- Harder: CI availability gated on home network + mini awake; supply-chain hygiene (digest pin, env-var contract verify, fine-grained PAT); cache discipline (weekly prune or disk fills).
- Revisit when: Phase 6b ready (run p95 RAM gate first); rollback toggle used >2×/quarter; team grows past solo; macOS billing forces paid-tier conversation; security incident on host or PAT.

## Revisions

- 2026-04-29 — Base-image refined by [ADR-0033](0033-runner-image-from-debian-and-actions-runner-tarball.md) (debian-slim + official actions/runner tarball, replacing myoung34 image). Rest of architecture unchanged.
