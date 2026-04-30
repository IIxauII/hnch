# ADR-0032: Self-hosted GitHub Actions runner — ephemeral arm64 Podman pool on Mac mini M4 (Tart deferred)

**Status:** Proposed (scope partially superseded by ADR-0037 — extends self-hosted to release.yml, deploy-*.yml, and the residual cheap ci.yml jobs; Tart deferral and runner-health-on-ubuntu pieces stand)
**Date:** 2026-04-29
**Deciders:** xau

## Context

The hnch repository is private on GitHub, which caps free Actions usage at 2,000 minutes/month (3,000 on Pro). Today every job in `.github/workflows/ci.yml` runs on `ubuntu-latest`:

- `detect-changes` + the `verify` matrix (one lane per workspace package: `shared`, `relay`, `client`, `cli`) + `version-audit` + `pr-title-lint` + `e2e` (Playwright) — fires on every push to `main` and every PR.
- `deploy-relay.yml`, `deploy-client.yml`, `release.yml` — tag-driven, SSH-only, must not depend on home-network availability.

The minute consumers are the **`verify` matrix** (multiple parallel lanes touching every workspace per [ADR-0014](0014-repo-layout-pnpm-workspaces.md): "`pnpm workspaces monorepo` with… `packages/client`, `packages/relay`, `packages/shared`, `packages/e2e`… `packages/cli`") and **`e2e`** (Playwright Chromium with browser install). Both grow with the matrix, both are insensitive to GitHub egress (they only `git clone` and run local toolchains). The cost trajectory is also about to step up: Phase 6b (native iOS) will require `macos-latest`, which on private repos bills at **10× the standard rate** — Phase 6b alone could exhaust the free tier in a few merges.

The hardware constraints that frame the alternative:

- **A Mac mini M4 is already available** as the user's daily-driver workstation: 10-core Apple Silicon, 16 GB RAM, fast NVMe, always-on at home.
- The existing **IONOS VPS** (`hnch-vps`) is already loaded with the production relay per [ADR-0029](0029-relay-deployment.md): "Deploy the relay bare-metal on a single IONOS VPS, supervised by `systemd`, fronted by Caddy…" It has 1 GB RAM total (~864 MiB usable) and zero headroom for a second workload, let alone one that runs Playwright. Co-location with prod is also a stability footgun.
- A **2014 MacBook Air** is in a drawer but is stuck on macOS Monterey, has no Apple-Silicon Xcode path, and is RAM-bound.
- The Mac mini must **stay usable as a daily driver**. Anything that pollutes the host (a global Node install, a global `actions/runner` checkout, hand-installed Playwright system libs, a long-lived shell environment leaking secrets between jobs) is unacceptable.
- Phase 6b iOS builds will eventually need a real macOS environment (Xcode, code-signing, simulators). Whatever runner architecture we adopt now must leave room for a macOS runner alongside it later.

The existing build/release plumbing constrains what can move. `deploy-relay.yml`, `deploy-client.yml`, and `release.yml` all need GitHub's runner egress (SSH to the IONOS VPS, npm publish, GitHub release creation) and must not depend on the user's home internet — pinning these to GitHub-hosted is non-negotiable.

A reasonable contributor could have responded to the billing pressure by upgrading to a paid tier, by adopting a paid macOS-runner SaaS, by deploying `actions-runner-controller` on a Kubernetes cluster, by installing the runner agent directly on the mini's host OS, or by accepting the Rosetta tax to run x64 Linux containers. This ADR records why we chose ephemeral arm64 Podman containers on the M4 and why we deferred the macOS half until Phase 6b is ready to land.

## Decision

Run all Linux CI jobs (the `verify` matrix and `e2e`) on a pool of **four ephemeral, rootless, arm64-native Podman containers** on the Mac mini M4, supervised by a per-user `LaunchAgent` running as the daily-driver account. Each container handles exactly one job and is destroyed afterward. The pool is sized to match the four-lane `verify` matrix.

Workflow `runs-on` is selected through a repo variable (`vars.LINUX_RUNNER`) so that switching back to `ubuntu-latest` is a single `gh variable set` invocation with no PR. `deploy-relay.yml`, `deploy-client.yml`, `release.yml`, and the cheap GitHub-API jobs (`detect-changes`, `version-audit`, `pr-title-lint`) stay on `ubuntu-latest`.

A macOS Tart runner for Phase 6b iOS is **explicitly deferred** to Phase 9 and gated on a 4-day p95 RAM measurement on the M4 — the M4's RAM is not field-upgradable, so the gate decides whether the existing mini can host the iOS VM or whether the next mini needs to be ordered with more RAM.

## Options Considered

### Option A: Ephemeral arm64 Podman pool on the M4, Tart deferred (CHOSEN)

A `LaunchAgent` runs a small `supervisor.sh` as the user account. The supervisor maintains four ephemeral containers built from a pinned `myoung34/github-runner` base (Node 22 + pnpm + Playwright system libs baked in), each registered with `EPHEMERAL=true` so it deregisters and exits after one job. Registration tokens are minted on the host from a fine-grained PAT (`actions:write` only on `IIxauII/hnch`) and passed to containers as short-lived (1-hour) `RUNNER_TOKEN`s — the PAT itself never enters a container. Per-runner pnpm stores and a shared Playwright cache live under `~/runner-cache/` and are bind-mounted into each container.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — Podman + LaunchAgent + supervisor + cache layout, all small and well-documented |
| Cost | Zero marginal — hardware already owned; expected GH minute spend drops to deploy/release only (~100–200 min/mo) |
| Scalability | Sized for one solo developer; four parallel lanes match the verify matrix |
| Team familiarity | Medium — Podman-on-macOS is newer than Docker but pattern is standard ephemeral-runner |

**Pros:**
- Each job runs in a fresh container — no env/cred/process bleed between jobs, no persistent runner state to compromise.
- arm64-native end-to-end (M4 → Podman VM → container → runner agent → Playwright) — no Rosetta tax, no x64 emulation surprises.
- Rootless top-to-bottom (Podman runs without a daemon as the user; container runs as uid 1000 inherited from `myoung34/github-runner`) — no `sudo`, no system-wide install, no daemon to leave around between reboots.
- PAT lives only in the supervisor process env on the host; containers see only a 1-hour registration token. A malicious dependency reading `/proc/self/environ` inside a job sees a token that is worthless after one job.
- One-line rollback: `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'` flips every job back to GitHub-hosted with no PR. Critical for home-network or Mac-mini outages.
- Leaves headroom for a Tart-based macOS runner later without re-architecting Linux CI.

**Cons:**
- CI now depends on home internet and Mac-mini uptime; outages require the rollback toggle (mitigated, but a real new dependency).
- 16 GB RAM is tight if Phase 9 (Tart + iOS VM) lands without a hardware upgrade. The M4's RAM is soldered, so the gating measurement must happen before iOS work begins, not during.
- Supervisor + LaunchAgent + Dockerfile + cache layout is more moving parts than the status quo (`runs-on: ubuntu-latest`), and they all live on the user's daily-driver machine.
- PAT scoping discipline must be maintained — a classic-scope or over-broad PAT would be a much larger blast radius if leaked from the host.

### Option B: hnch-vps (IONOS) hosts the runner

Reuse the existing IONOS VPS already provisioned per [ADR-0029](0029-relay-deployment.md). Install the runner agent (or Podman) on the same box that runs production.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low setup, high operational risk |
| Cost | Zero marginal hardware; high opportunity cost if it destabilizes prod |
| Scalability | None — 1 GB total RAM, ~864 MiB usable, prod relay already resident |
| Team familiarity | High — same VPS already operated by the user |

**Pros:** uses hardware already paid for; always-on; not behind a home NAT; no LaunchAgent or supervisor to maintain.

**Cons:** the VPS has 1 GB total RAM and is already running the prod relay, Caddy, and systemd. Playwright + Chromium peaks would push the box into swap and threaten production stability. Co-locating CI with the public relay also widens the blast radius of any compromised job. Rejected.

### Option C: 2014 MacBook Air

Repurpose the existing 2014 Air as a dedicated runner host.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — older hardware, EOL OS |
| Cost | Zero marginal hardware |
| Scalability | None — Intel CPU, 4–8 GB RAM, no Apple-Silicon path |
| Team familiarity | High |

**Pros:** dedicated hardware, no daily-driver pollution, free.

**Cons:** macOS Monterey is past Apple's security update window; Xcode versions required for current iOS development don't run on it; Intel-only means we'd be running x64 emulation against the production target if we ever wanted to share a runner image with the M4 path; Playwright Chromium at scale is not happy with 4–8 GB RAM. Rejected.

### Option D: actions-runner-controller (Kubernetes)

Run the official Kubernetes-based runner controller on a single-node cluster on the M4 (or anywhere).

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — Kubernetes, controller manifests, scaler config, image pull secrets |
| Cost | Zero monetary marginal; significant operational cost |
| Scalability | Excellent at multi-tenant scale |
| Team familiarity | Medium |

**Pros:** the canonical "ephemeral runners on your hardware" project; well-supported; auto-scaling; multi-repo and multi-org friendly.

**Cons:** Kubernetes for a single Mac mini hosting one repo's runners is overkill by an order of magnitude. The control plane alone consumes a meaningful share of the 16 GB budget; the operator surface (CRDs, scalers, image pull secrets, webhook auth) is a permanent cost paid on every upgrade. Rejected.

### Option E: Paid macOS-runner SaaS (Anka, MacStadium Orka, AWS EC2 Mac, runs-on.com)

Outsource the runner pool to a managed provider.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — managed |
| Cost | Recurring monthly fee, typically $25–250/mo for an always-on macOS instance |
| Scalability | Very good |
| Team familiarity | Varies |

**Pros:** zero local hardware to operate; stable, dedicated CI capacity; handles macOS licensing requirements correctly.

**Cons:** recurring cost outside the existing IONOS bundle, with no offsetting benefit at v1 (one developer, intermittent CI load). Doesn't help with the Linux verify/e2e jobs that are today's primary minute consumers. Rejected on cost.

### Option F: Direct host install of the runner agent on the M4 (no container)

Install `actions/runner` straight onto the Mac mini's host OS, register it, run jobs in the user's normal shell environment.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Zero marginal |
| Scalability | One runner per host |
| Team familiarity | High |

**Pros:** simplest possible setup — `./config.sh`, `./run.sh`, done.

**Cons:** pollutes the daily-driver host with whatever the runner's jobs install (apt-equivalents via Homebrew, global npm packages, Playwright browser binaries in `~/Library`, leftover pnpm artifacts). State leaks between jobs (env vars, files in `/tmp`, cached creds in `~/.config`), which is the canonical reason ephemeral containerized runners exist. Rejected — incompatible with the "must not pollute the host" constraint.

### Option G: x64 Linux containers via Rosetta on the M4

Run the existing GitHub-hosted-equivalent x64 Ubuntu image under Rosetta translation inside the Podman VM.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Same as Option A |
| Cost | Zero marginal |
| Scalability | Lower — Rosetta tax on every CPU-bound step |
| Team familiarity | High |

**Pros:** maximizes parity with the GitHub-hosted runner image; no surprises if a future native dep ships only x64 wheels.

**Cons:** Rosetta translation imposes a measurable CPU tax on every step (Node startup, TypeScript compile, Playwright browser launch). The mini is arm64-native and the entire current toolchain has working arm64 builds. Trading native speed for hypothetical x64-only-dep coverage is the wrong default. Rejected as the default; documented as a `--platform linux/amd64` escape hatch if a specific dep ever forces it.

## Trade-off Analysis

Option A wins on the combination of three constraints that no other option satisfies simultaneously: **(1)** keeps the daily-driver host clean (eliminates Options F, partially C); **(2)** doesn't touch production hardware (eliminates Option B); **(3)** costs nothing recurring (eliminates Option E, and is the deciding factor over Option D's operational tax). The arm64-native posture (rejecting Option G as default) is a performance choice; the rootless-top-to-bottom posture is a security/hygiene choice that compounds with the ephemeral-per-job lifecycle.

What we give up:

- **A new uptime dependency.** CI now depends on home internet and the mini being awake. The `vars.LINUX_RUNNER` toggle is the explicit mitigation — flipping back to `ubuntu-latest` is a one-liner with no PR — but the dependency is real and the toggle has to be remembered when something breaks. The expectation is that outages cost a developer-controlled rollback, not a CI hard-fail.
- **A 16 GB RAM ceiling that becomes binding when Phase 6b lands.** The four-runner pool plus a Tart macOS VM plus a daily-driver workload doesn't comfortably fit. Because the M4's RAM is soldered, this becomes an order-time decision the next time hardware is purchased, not a knob we can turn later. The pre-Phase-9 p95 measurement is the gate — if it's >10 GB on the four-runner pool alone, Phase 9 buys a new mini before adding the Tart VM.
- **A new credential surface.** A fine-grained PAT must exist somewhere, and "somewhere" is the macOS Keychain on the daily-driver mini. The PAT-never-enters-container architecture limits blast radius, but the host-side keychain entry is now a thing to protect (and rotate). The trade is acceptable because the PAT scope is narrow (`actions:write` on one repo) and never push-to-main.
- **More moving parts than `runs-on: ubuntu-latest`.** Dockerfile + supervisor script + LaunchAgent + cache directory layout + weekly prune + health-check workflow. Each is small, but the total surface area is larger than zero. The `infra/README.md` runbook is the mitigation.

What we explicitly do **not** give up:

- **Deploy and release reliability.** Per [ADR-0029](0029-relay-deployment.md), the relay deploy story is `deploy-relay.yml` triggered on `relay-v*` tags rsyncing over SSH; the analogous client deploy on `client-v*` tags ships static files to `/var/www/hnch-client/`. Both must not depend on home internet — they stay on `ubuntu-latest`. So does `release.yml` (npm publish, GitHub releases) and the GitHub-API-bound jobs (`detect-changes`, `version-audit`, `pr-title-lint`). The self-hosted change is scoped to the minute hogs and nothing else.
- **The per-package verify shape.** [ADR-0014](0014-repo-layout-pnpm-workspaces.md)'s pnpm-workspaces layout is the surface the matrix walks: one lane per package. The four-runner pool is sized exactly to that matrix. If the workspace gains a fifth package later, the pool size and the verify matrix grow together.

## Consequences

**Easier:**

- Actions minute spend drops to deploy/release/health-check only — projected ~100–200 min/month against the 2,000-minute free tier, with comfortable headroom for Phase 6b's macOS billing if/when the macOS runner is also self-hosted.
- Each job starts in a known-clean container — no inherited `node_modules`, no leftover `/tmp`, no cached creds. Bleed between jobs is structurally prevented, not just discouraged.
- arm64-native runs match the local development environment (M-series Macs) more closely than ubuntu-latest x64 does. Dev/CI parity improves on the dimensions that matter (Node binary selection, native-deps install paths) for the developers actually touching the code.
- Future iOS work has a documented landing pad (Tart + Orchard, Phase 9) that doesn't require re-architecting Linux CI.

**Harder:**

- CI availability is now a function of the daily-driver mini being awake and the home network being up. The rollback toggle (`gh variable set LINUX_RUNNER`) is the documented escape hatch; using it is a manual step.
- The 16 GB RAM ceiling becomes a hardware-purchasing concern at Phase 9 (Tart + iOS VM) rather than a config knob. The mini's RAM is not field-upgradable, so the choice has to be made at order time — flagged here so the gate measurement happens before, not after.
- Supply-chain hygiene tightens: the runner base image must be digest-pinned (not `:latest`), the env-var contract with `myoung34/github-runner` must be re-verified at each bump, and the PAT must remain fine-grained (`actions:write` only) rather than a classic broad-scope token.
- Cache discipline matters more on a long-lived host than it does on ephemeral ubuntu-latest VMs — pnpm stores grow without bound unless pruned. A weekly prune LaunchAgent is the mitigation; without it, disk fills.

**Revisit triggers:**

- **Phase 6b (native iOS) is ready to start.** The pre-Phase-9 p95 RAM gate must run first; if the four-runner pool + daily-driver workload is already pushing the mini past 10 GB, ordering a higher-RAM mini happens before the Tart work begins.
- **Home network or Mac-mini availability becomes a chronic bottleneck.** If the rollback toggle is being used more than a couple of times per quarter, or if it's being used during release windows, the cost-benefit of self-hosting on a home-LAN single point of failure has flipped. The next ADR would either move the runner host to a colo / dedicated cloud Mac, or revert to `ubuntu-latest` on a paid Actions tier.
- **The team grows past one developer.** The four-runner pool is sized for solo workflow (one developer rarely runs >4 lanes truly concurrently). A second active developer pushes the pool into queueing and a third probably exceeds the M4's per-job RAM budget. At that point, either grow the pool on bigger hardware or move back to GitHub-hosted with the budget to match.
- **Phase 6b iOS billing pressure forces a paid-tier conversation regardless.** If macOS runners must run on GitHub-hosted at 10× rates for any reason (e.g., code-signing constraints that don't fit Tart), the math changes for the Linux jobs too — keeping them self-hosted may or may not still be worth the operational tax.
- **A security incident involving the runner host or PAT.** Any compromise (or near-miss) of the daily-driver mini, the LaunchAgent supervisor, or the runner PAT should immediately revert to `ubuntu-latest` via the toggle and trigger a successor ADR before re-enabling.

## Revisions

- **2026-04-29** — Base-image choice refined by ADR-0033 (debian-slim + official actions/runner tarball, replacing the myoung34 image). The rest of this ADR (4 ephemeral arm64 Podman containers on M4, rootless top-to-bottom, supervisor on host, vars.LINUX_RUNNER toggle, Tart deferred to Phase 9) is unchanged.

## Action Items

- [ ] Implement the architecture per `plans/plan-self-hosted-runner.md` (Phases 1–8). Phase 9 (Tart + Orchard for iOS) is deferred to Phase 6b.
- [ ] Add `infra/runner/` (Dockerfile, supervisor.sh, LaunchAgent plists for supervisor and weekly prune) and the `infra/README.md` "Self-hosted runner pool" section, including the rollback runbook (`gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'`).
- [ ] Add `.github/workflows/runner-health.yml` (hourly `ubuntu-latest` cron checking that ≥1 `hnch-podman` runner is online).
- [ ] Modify `.github/workflows/ci.yml` so `verify` and `e2e` consume `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}` with a fork-PR `if:` guard and a `timeout-minutes`. Keep `deploy-relay.yml`, `deploy-client.yml`, `release.yml`, `detect-changes`, `version-audit`, and `pr-title-lint` on `ubuntu-latest`.
- [ ] Issue a fine-grained PAT scoped to `IIxauII/hnch` with `actions:write` only. Store in macOS Keychain (`security add-generic-password -s hnch-runner-pat -a xau`). Document rotation procedure in `infra/README.md`.
- [ ] Create the `LINUX_RUNNER` repo variable with default `'["ubuntu-latest"]'`. Flip to `'["self-hosted","linux","arm64","hnch-podman"]'` only after the runner pool reports healthy.
- [ ] Capture the M4 baseline RAM measurement (4-day p95 via `vm_stat` cron, methodology in the plan) once the four-runner pool has been steady-state for a week. Record the result in `infra/README.md` so the Phase 9 gate has a documented number.
- [ ] After 1 month of self-hosted operation, snapshot `gh api /user/settings/billing/actions` and confirm the projected ~100–200 min/mo is roughly accurate. If it's materially higher, investigate whether health-check cadence or fork-PR fallthrough is the cause before drawing conclusions about architecture.
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-line entry referencing this ADR (the ADR author cannot edit `CLAUDE.md` directly — flag for orchestrator).
- [ ] **Revisit watch.** Before Phase 6b implementation begins, re-read the "Revisit triggers" section, re-run the p95 RAM gate, and decide on hardware before committing to Tart + iOS work. If the gate fails, write a successor ADR for the hardware/runner-host change before adding the iOS runner.
