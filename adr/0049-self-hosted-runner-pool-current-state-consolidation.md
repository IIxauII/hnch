# ADR-0049: Self-hosted runner pool — current-state consolidation

**Status:** Superseded by ADR-0056
**Date:** 2026-06-13

**Caveat (2026-10-30, #591):** `version-audit` and `pr-title-lint` are no longer jobs; they run as steps of `detect-changes`.

Consolidates ADR-0032, ADR-0033, ADR-0037, ADR-0047 into one current-state statement. Those four accreted the runner topology over five partial supersedes; reconstructing the live setup required reading all of them in order. This ADR restates the topology standalone and retires the chain. Those four files are deleted; this ADR is the sole record — see git history for their bodies. No live decision changes — editorial consolidation per `README.md` Conventions. The runner-location clause of [ADR-0029](0029-relay-deployment.md) is also superseded here (its ssh/symlink/systemd deploy mechanism stands).

## Context

- Private repo on GitHub → 2,000 free Actions min/month (3,000 Pro). Minute hogs: `verify` matrix (one lane per workspace package per [ADR-0014](0014-repo-layout-pnpm-workspaces.md)) + `e2e` (Playwright Chromium); plus `release.yml` (~25 min/mo), `deploy-*.yml` (~30–50 combined), cheap `ci.yml` jobs.
- Hardware: Mac mini M4 (10-core, 16 GB soldered RAM, NVMe, always-on), solo-operator daily-driver — must stay clean. IONOS VPS (1 GB RAM, prod relay per [ADR-0029](0029-relay-deployment.md)) rejected as runner host: no headroom, co-location blast radius.
- "Deploy/release must not depend on home-network availability" framing (original ADR-0032 carve-out) doesn't survive scrutiny: `release.yml` triggers on `push: main` or `workflow_dispatch` — both presuppose the operator can reach GitHub from the same home network the mini lives on. Home internet down → trigger never fires regardless of runner location.
- `runner-health.yml` is a dead-man's-switch — must not run on the pool it monitors; a dead pool would produce no failure signal. Dependabot is GitHub-managed.
- Pool is single-arch arm64-linux; IONOS VPS is x86_64. `pnpm --filter @hnch/relay deploy` resolves optional native bins against build-host arch — cross-arch hazard, structural even while current relay deps are pure JS.
- Phase 6b (native iOS) needs `macos-latest`, billed 10× on private repos; Tart-based macOS runner on the M4 is the future landing pad but gated on a RAM-budget measurement (RAM soldered).

## Decision

Run all Linux CI/CD on an ephemeral, rootless, arm64-native **Podman pool on the M4 Mac mini**, supervised by per-user `LaunchAgent`. One job per container, then destroyed; pool size = `verify` matrix lane count.

- **Image:** built from `debian:bookworm-slim` + the official `actions/runner` Linux arm64 tarball (`github.com/actions/runner/releases`), sha256-verified at build against a pinned Dockerfile `ARG`. Own ~30-line `entrypoint.sh` (`./config.sh --unattended --ephemeral --disableupdate` then `./run.sh`). No third-party wrapper image — removes a personal-maintainer trust hop, consistent with the PAT/Keychain/digest-pin posture. Manual `RUNNER_VERSION` bumps, monthly review cadence in `infra/README.md`.
- **Coverage:** every Linux GHA job runs on the pool **except `runner-health.yml`** (stays `ubuntu-latest`) and Dependabot. Flipped: `verify`, `e2e`, `ci.yml` residuals (`detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`), `release.yml`, `deploy-client.yml`, `deploy-relay.yml`, `screenshots-main.yml`.
- **Targeting:** `runs-on: [self-hosted, linux, arm64, hnch-podman]` hardcoded inline on every flipped job. **No hosted fallback** — no `LINUX_RUNNER` var, no `ubuntu-latest` escape expression. Recovery from a dead pool is "bring the pool back" (power on the mini), surfaced within the hour by `runner-health.yml`.
- **Cross-arch:** `deploy-relay.yml` staging step sets `npm_config_target_platform=linux` + `npm_config_target_arch=x64` so pnpm optional-native resolution targets the VPS arch; `.npmrc` `supported-architectures` fallback documented. Smoke test `curl -fsS https://hnch.dev/health` is the safety net.
- **macOS:** Tart-based runner deferred to Phase 9, gated on a 4-day p95 RAM measurement before committing soldered-RAM budget. x64 via Rosetta is a documented `--platform linux/amd64` escape hatch, not the default.
- Existing fork-PR skip-guards on `verify`/`e2e` retained (skip-not-fallback, cost zero). New flips carry no fork-PR conditional — zero forks today; untrusted PRs would need `pull_request_target` / maintainer approval anyway.

## Trade-offs

- CI/release/deploy availability is load-bearing on host uptime, no software mitigation: home internet + mini awake. A dead pool queues all Linux jobs until the host is physically recovered — no "ship from hosted while the mini is unreachable" path. The only lever is a deterministic host spin-up procedure (`infra/README.md`).
- Lost the one-command remote rollback and the fat-finger guard: inline labels mean a typo strands jobs on a non-existent runner (caught by a queued job, not green-on-wrong-runner). Re-introducing a fallback means re-templating every `runs-on`.
- Cross-arch deploy mitigation is a permanent burden on `deploy-relay.yml`, regression caught only by smoke test — won't catch silent runtime breakage on uncovered code paths.
- ~50 lines of Dockerfile + entrypoint ours to maintain; no Dependabot tag-bump notification for the runner version (forgotten bump = degraded freshness, not broken security).
- New credential surface: fine-grained PAT in macOS Keychain on the daily-driver (`Administration: Read and write`, one repo); `NPM_TOKEN` + `RELEASE_TOKEN` reach the pool per release, bounded by ephemeral one-job container lifetime.
- 16 GB soldered RAM becomes an order-time decision before Phase 9 (Tart + iOS VM).
- More moving parts: Dockerfile + supervisor + LaunchAgent + cache layout + weekly prune + health-check workflow.

## Consequences

- Easier: hosted Actions spend → near-zero (`runner-health.yml` cron + Dependabot only); clean per-job containers; arm64 dev/CI parity; `runs-on` reads literally with no var lookup; new Linux workflows copy a concrete label list and default to the pool by convention; deploy jobs can never silently land on x86_64 hosted; Phase 6b macOS billing trajectory more comfortable; runner-version bumps visible in `git log` like npm deps.
- Harder: cache discipline (weekly prune or disk fills); supply-chain hygiene (digest pin, env-var contract verify, PAT/token rotation now part of mini-runner secret hygiene); release tarball can be half-shipped if the mini reboots mid-deploy (recovery via [ADR-0029](0029-relay-deployment.md) symlink-rollback runbook + idempotent re-dispatch); back-to-back relay+client tags can briefly queue.
- Revisit when: Phase 6b ready (run p95 RAM gate first, then land Tart macOS runner); a dead pool blocks a time-critical release with the host unreachable (re-add a scoped fallback or invest in host availability / second runner); cross-arch artifact regression slips past the smoke test; repo opens to fork PRs (hosted runners for untrusted PRs — addendum ADR); macOS billing forces a paid-tier conversation; team grows past solo; security incident on host, PAT, or a published token.
