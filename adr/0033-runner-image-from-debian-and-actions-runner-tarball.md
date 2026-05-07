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

## Trade-offs

- ~50 lines of Dockerfile + entrypoint ours to maintain. Stable upstream interface; CI runs every job → regressions loud.
- No Dependabot tag bump notification. Mitigation: monthly review cadence in `infra/README.md`, or Dockerfile `ARG` Dependabot ecosystem if supported.
- One-time sha256 lookup per bump: `releases/download/v<version>/...tar.gz.sha256`. Documented step-by-step.
- `node:22-bookworm-slim` rejected: adds Node project as trust hop for one apt line; ~3× larger.
- `myoung34/github-runner` (original) rejected on principle: personal-maintainer trust hop persists; mitigations reduce but don't eliminate blast radius.
- `summerwind/actions-runner` rejected: same third-party-wrapper trust shape; designed for k8s controller, awkward standalone.
- `ubuntu:22.04` rejected: ~150 MB larger; parity benefit hypothetical (`actions/runner` identical on both).
- `alpine` rejected: Playwright Chromium glibc-only; `gcompat` defeats size win.

## Consequences

- Easier: one fewer trust hop; env-var contract owned + consistent; bumps visible in `git log` like npm dep bumps.
- Harder: ~50 lines to keep in sync with upstream; manual `RUNNER_VERSION` bumps (forgotten = degraded freshness, not broken security).
- Revisit when: `entrypoint.sh` >~100 lines; GitHub publishes official runner Docker image (switch immediately); sha256 verify fails (treat as security event); Playwright/Node hard-requires Ubuntu.
