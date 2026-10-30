# ADR-0056: GitHub-hosted runners for all CI/CD — self-hosted pool retired

**Status:** Accepted
**Date:** 2026-10-30

Supersedes [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md) (self-hosted pool), [ADR-0052](0052-single-e2e-runner-slot.md) (single `e2e` slot) and [ADR-0053](0053-runner-pool-two-slots.md) (2-slot pool size). Owner decision 2026-10-30 (#626): all CI/CD moves to GitHub-hosted runners before the repo goes public.

## Context

- ADR-0049 pool existed only for the private repo's Actions minutes quota.
- Repo goes public (#626). A `pull_request` run uses the workflow file from the PR, so a fork PR can retarget any job's `runs-on` at the pool; job-level fork guards don't help. GitHub: self-hosted runners should almost never serve public repos.
- Pool kept state between jobs (per-slot `_work`, shared pnpm store, `node_modules` snapshots, setup-node tool cache). PR CI could plant code that release and deploy jobs later ran with their secrets (#558).
- Standard hosted runners: free and unlimited on public repos. `ubuntu-24.04-arm`: 4 CPU / 16 GB public, 2 CPU / 8 GB private (billed against included minutes until the flip).
- Each hosted job gets a fresh VM: no CPU shared with another job (ADR-0052's reason gone), no slot count (ADR-0053's reason gone).
- Actions cache is scoped per ref: a run restores from its own ref and the default branch only. Caches a PR run writes, a fork's included, never reach main.
- Pool runner 2.336.0 stops taking jobs 2026-11-05 (#576); hosted runners need no bumps.

## Decision

Every job in every workflow runs on a GitHub-hosted runner: `ubuntu-24.04-arm` for all CI/CD (arm64 parity with the old pool and dev machines); the Mac mini pool, `infra/runner/` and `runner-health.yml` retire.

- **Fork PRs:** run `verify` and `e2e` on hosted runners, without secrets. They record no verified-skip evidence (ADR-0055): a fork's run uses the fork's workflow file.
- **Install:** CI jobs restore the pnpm store from the Actions cache, keyed on the lockfile hash. Release and deploy jobs restore no cache and install cold.
- **e2e:** one job, not sharded; Playwright workers = min(4, CPUs). `E2E (Playwright)` stays the merge check.
- **Pinning:** every action pinned to a full commit SHA with a `# vX.Y.Z` comment (Dependabot updates both); `release.yml` installs an exact npm version. `scripts/ci/workflow-policy.mjs`, run in `detect-changes`, fails on a non-hosted `runs-on`, an unpinned action, or an inexact npm.

## Trade-offs

- Cold VMs: every job pays setup-node, the store restore and, for Playwright jobs, the browser and its apt packages. Release and deploys download every package each run.
- Until the flip: hosted minutes billed, on 2 CPUs; e2e runs with 2 workers and takes longer.
- No control over runner hardware or image; image updates land on GitHub's schedule.
- SHA pins: updates arrive only through Dependabot PRs; a hand edit must keep the SHA and comment in step.
- One e2e job: wall time stays one Playwright run; shards would cut it but repeat install, browser install and client build per shard, and need an aggregator for the merge check.

## Consequences

- Easier: no host to keep awake, patch or recover; no runner-version bumps; no PAT for runner registration or health checks; fork PRs get full CI safely; no shared state between untrusted and trusted jobs; Playwright jobs no longer queue behind each other.
- Harder: CI speed bounded by hosted runner size; Actions cache size limit (10 GB per repo) and eviction apply; a new workflow must use a hosted label and pinned actions or `detect-changes` goes red.
- Revisit when: native iOS CI lands (hosted `macos-*` runners, free on public repos; ADR-0049's Tart-on-M4 plan retires with that ADR); e2e wall time becomes the merge bottleneck (shard, with an `E2E (Playwright)` aggregator); the repo goes private again (minutes billed); hosted arm64 capacity or queue times degrade.
