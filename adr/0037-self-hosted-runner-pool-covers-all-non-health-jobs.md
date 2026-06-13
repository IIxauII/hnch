# ADR-0037: Self-hosted runner pool covers all CI/CD jobs except `runner-health.yml`

**Status:** Superseded by ADR-0049
**Date:** 2026-04-30

## Context

- [ADR-0032](0032-self-hosted-github-actions-runner.md) put `verify` + `e2e` on the M4 Podman pool; carved out `release.yml`, `deploy-*.yml`, and cheap `ci.yml` jobs to `ubuntu-latest`, inheriting [ADR-0029](0029-relay-deployment.md) "must not depend on home-network availability" framing.
- Framing doesn't survive scrutiny: `release.yml` triggers on `push: main` (semantic-release tag) or `workflow_dispatch`. Both presuppose user can reach GitHub from same home network mini lives on. Home internet down → trigger never fires regardless of runner location.
- Residual hosted-minute consumers: `release.yml` ~25 min/mo; `deploy-relay.yml` + `deploy-client.yml` ~30–50 combined; cheap `ci.yml` jobs (`detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`) small but non-zero.
- `runner-health.yml` cannot move — dead-man's-switch fires when pool dead, can't run on pool it monitors. Dependabot GitHub-managed.
- Repo private, solo-dev, zero forks today → fork-PR `if:` fallback pattern from ADR-0032 not architecturally required on new flips. Existing guards on `verify`/`e2e` retained (skip-not-fallback, cost zero).
- Cross-arch hazard: M4 runner image arm64-linux ([ADR-0033](0033-runner-image-from-debian-and-actions-runner-tarball.md)); IONOS VPS x86_64 ([ADR-0029](0029-relay-deployment.md)). `pnpm --filter @hnch/relay deploy` resolves optional native bins against build host arch. Today's relay deps pure JS (`bufferutil`/`utf-8-validate` filtered by host platform), but hazard structural.

## Decision

Route every Linux GHA job to `vars.LINUX_RUNNER` except `runner-health.yml` and Dependabot. Uniform `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}`; no fork-PR conditional on new flips. Flipped: `ci.yml` residuals, `release.yml`, `deploy-client.yml`, `deploy-relay.yml`. On `deploy-relay.yml` staging step: set `npm_config_target_platform=linux` + `npm_config_target_arch=x64` so pnpm optional-native resolution targets VPS arch; `.npmrc` `supported-architectures` fallback documented. `runner-health.yml` stays `ubuntu-latest`. Existing fork-PR guards on `verify`/`e2e` unchanged.

## Trade-offs

- Theoretical out-of-band dispatch path lost (release from phone on cellular while mini down) — toggle is one command, `runner-health.yml` raises alarm within hour, not an actual operational pattern.
- Mini load increase modest, sequential (release → deploy chain, not parallel) → ADR-0032 RAM gate methodology still applies.
- Cross-arch mitigation only effective if it survives future yaml edits; smoke test (`curl -fsS https://hnch.dev/health`) is safety net but won't catch silent runtime breakage on uncovered code paths.
- `NPM_TOKEN` reaches self-hosted container per release; bounded by ephemeral one-job lifetime same as `RELEASE_TOKEN`; secret-type count grows by one.
- Stop-at-cheap-`ci.yml` rejected: leaves largest residual consumers (release ~25 + deploys ~30–50 min/mo) on hosted without load-bearing reason; two carve-outs to remember.
- Moving `runner-health.yml` rejected: defeats workflow purpose — dead pool produces no failure signal, looks identical to "no problem".
- Fork-PR fallback yaml on new flips rejected as default: defensive verbosity for case requiring `pull_request_target` or maintainer-approved-run anyway.

## Consequences

- Easier: hosted spend → near-zero (`runner-health.yml` cron + Dependabot only); single rollback for entire CI/CD via `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'`; new Linux workflows default to pool by convention; Phase 6b macOS billing trajectory more comfortable.
- Harder: cross-arch deploy mitigation = permanent burden on `deploy-relay.yml`, regression caught only by smoke test; release tarball can be half-shipped if mini reboots mid-deploy (recovery via [ADR-0029](0029-relay-deployment.md) symlink-rollback runbook + idempotent re-dispatch); `NPM_TOKEN` rotation now part of mini-runner secret hygiene; pool sizing was for 4-lane verify, sequential release/deploy fits but back-to-back relay+client tags can briefly queue.
- Revisit when: ≥1 deploy/release blocked per quarter by mini-side issue (carve back release/deploys, or invest in mini availability); cross-arch artifact regression smoke test misses; repo opens to fork PRs (addendum ADR for new flips); team grows past solo (ADR-0032 trigger).
