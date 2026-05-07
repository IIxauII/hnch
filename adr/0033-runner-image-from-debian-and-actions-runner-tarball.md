# ADR-0033: Runner image from `debian:bookworm-slim` + official `actions/runner` tarball (refines ADR-0032 §base-image)

**Status:** Proposed
**Date:** 2026-04-29

## Context

- [ADR-0032](0032-self-hosted-github-actions-runner.md) named `myoung34/github-runner:2.321.0` as runner base image.
- `myoung34/github-runner` is personal Docker Hub image, MIT, single-maintainer; substance = official `actions/runner` Linux tarball + ~50-line bash entrypoint with env-var contract (`REPO_URL`, `RUNNER_TOKEN`, etc.).
- Trust ledger of original choice: Debian → GitHub → personal Docker Hub maintainer → our Dockerfile.
- Containers see registration tokens, source code, bind-mounted pnpm cache → trust hop is non-trivial.
- Removing maintainer hop costs ~30 lines bash + ~20 lines Dockerfile (we'd read upstream entrypoint anyway to know env-var contract). Inconsistent with ADR-0032's PAT/Keychain/digest-pin posture to keep it.
- Rest of ADR-0032 (lifecycle, supervisor, rootless, fork-PR guard, `vars.LINUX_RUNNER`, Tart deferral) orthogonal to base image.

## Decision

Build runner image from `debian:bookworm-slim` + official `actions/runner` Linux arm64 tarball downloaded from `github.com/actions/runner/releases/v<version>`, sha256-verified at build time against pinned digest in Dockerfile `ARG`. Own ~30-line `entrypoint.sh` (`./config.sh --unattended --ephemeral --disableupdate` then `./run.sh`). Bump runner to `v2.334.0` (was `v2.321.0`). Nothing else in ADR-0032 changes.

## Options

- **A — `debian:bookworm-slim` + official tarball + own entrypoint (CHOSEN):** trust = Debian + GitHub + ~30 lines ours. Pros: drops maintainer hop; env-var contract ours; sha256-verified bumps auditable in `git log`; smallest base. Cons: ~50 lines to maintain; bump cadence manual (monthly review or Dependabot if supports `ARG` pins); apt-install Node/pnpm/Playwright libs ourselves.
- **B — `node:22-bookworm-slim` + tarball + own entrypoint:** Node preinstalled. Cons: adds Node project as trust hop for one apt line; ~3× larger. Rejected.
- **C — `myoung34/github-runner:<digest>` (original choice):** smallest code we own; inherits tested handshake. Cons: personal-maintainer trust hop persists; mitigations (digest pin, ephemerality, non-privileged) reduce but don't eliminate blast radius. Rejected on principle.
- **D — `summerwind/actions-runner` (used by ARC):** institutional backer. Cons: same third-party-wrapper trust shape as C; designed for k8s controller, awkward standalone. Rejected.
- **E — `ubuntu:22.04`:** parity with `ubuntu-latest`. Cons: ~150 MB larger; parity benefit hypothetical (`actions/runner` identical on both). Rejected.
- **F — `alpine`:** smallest. Cons: Playwright Chromium glibc-only; `gcompat` defeats size win. Rejected.

## Trade-offs

- ~50 lines of Dockerfile + entrypoint ours to maintain. Stable upstream interface; CI runs every job → regressions loud.
- No Dependabot tag bump notification. Mitigation: monthly review cadence in `infra/README.md`, or Dockerfile `ARG` Dependabot ecosystem if supported.
- One-time sha256 lookup per bump: `releases/download/v<version>/...tar.gz.sha256`. Documented step-by-step.

## Consequences

- Easier: one fewer trust hop; env-var contract owned + consistent; bumps visible in `git log` like npm dep bumps.
- Harder: ~50 lines to keep in sync with upstream; manual `RUNNER_VERSION` bumps (forgotten = degraded freshness, not broken security).
- Revisit when: `entrypoint.sh` >~100 lines (reconsider Option C w/ digest pin + diff audit); GitHub publishes official runner Docker image (switch immediately); sha256 verify fails (treat as security event); Playwright/Node hard-requires Ubuntu (reconsider Option E).

## Action Items

- [ ] `infra/runner/Dockerfile`: `FROM debian:bookworm-slim`, `ARG RUNNER_VERSION=2.334.0`, `ARG RUNNER_SHA256=<digest>`, apt Node 22 + pnpm + Playwright libs, curl + `sha256sum -c` tarball, extract `/runner`, copy entrypoint, `USER 1000`.
- [ ] `infra/runner/entrypoint.sh` (~30 lines): consume `REPO_URL`/`RUNNER_TOKEN`/`RUNNER_NAME`/`RUNNER_LABELS`; `config.sh --unattended --ephemeral --disableupdate`; exec `run.sh`; trap exits → `config.sh remove`.
- [ ] Document sha256-lookup procedure + monthly bump cadence in `infra/README.md`.
- [ ] Investigate Dependabot Dockerfile `ARG` pin support; add entry if supported.
- [ ] Update `plans/plan-self-hosted-runner.md` Phase 2 to `v2.334.0` and reference this ADR.
- [ ] Update `CLAUDE.md` glance entry to reference both ADR-0032 and ADR-0033 (flag for orchestrator).
