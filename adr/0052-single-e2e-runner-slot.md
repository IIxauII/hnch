# ADR-0052: Single `e2e` runner slot — one Playwright job at a time on the pool

**Status:** Accepted
**Date:** 2026-10-29

Refines ADR-0049 Targeting clause (label list for Playwright jobs). Hardcoded-inline, no-hosted-fallback rule unchanged.

## Context

- ADR-0049 pool: N ephemeral podman containers (`hnch-runner-<slot>-<epoch>`) inside one podman VM (`hnch-runner`, 8 vCPU / 10 GiB) on the M4 mini. Every pool job targets `[self-hosted, linux, arm64, hnch-podman]`, so any job lands on any slot.
- Playwright jobs are the heaviest on the pool: `ci.yml` `e2e` (4 Playwright workers + `ng serve` + wrangler/workerd relay) and `screenshots-main.yml` (Playwright + `ng serve` + relay). Containers share the VM's CPUs; nothing caps a container.
- 2026-10-29 08:52–08:55 UTC: PR run 40844549905 (e2e on `hnch-runner-2`) and main push run 40843886516 (e2e on `hnch-runner-1`) overlapped. Every step ran 4–5× slower; a test ran out its 45 s budget; the main e2e job took 8 m 35 s against a 10 min timeout (solo runs: 4.5–7 min).
- Owner rule: no flakes, no reruns. CPU contention between Playwright jobs is a flake source the tests cannot fix.
- Runners re-register for every job (`--ephemeral`); supervisor passes labels at each registration.

## Decision

Supervisor registers exactly one slot (slot 1) with an extra `e2e` label; every Playwright-running job targets `[self-hosted, linux, arm64, hnch-podman, e2e]`, so at most one runs pool-wide at a time.

## Trade-offs

- Playwright jobs from different refs serialize: a second e2e / screenshots job waits for the first (~5–8 min each). A main merge's e2e + screenshot refresh now run back-to-back instead of in parallel.
- Slot 1 still takes non-Playwright jobs; an e2e job can wait behind whatever slot 1 is running (verify ≤3 min, deploy/release ≤10 min).
- One slot is a single point for Playwright: slot 1 down or mislabeled → e2e jobs queue (up to GitHub's 24 h self-hosted queue cap), while `runner-health.yml` stays green (checks `hnch-podman` only).
- Removes Playwright-vs-Playwright contention only. Other slots still run heavy jobs (verify lanes, `ng build`, wrangler dry-run, deploy/release builds) on the same 8 vCPUs while e2e runs: at most one other job at POOL_SIZE=2, up to three at 4.
- Labels now differ per slot: label set lives in `supervisor.sh`, not one literal string.

## Consequences

- Easier: at most one Playwright job on the VM; CPU-contention flakes between Playwright jobs ruled out by construction; POOL_SIZE changes don't touch Playwright concurrency.
- Harder: new Playwright-running workflow must add `e2e` to `runs-on` or reintroduces the overlap; label changes are ordered — rollout: host supervisor installed + pool restarted (slot 1 carries `e2e`) before any workflow requiring the label runs, including the introducing PR's own CI; rollback: revert workflows first, supervisor second. Wrong order strands e2e jobs in the queue.
- Revisit when: e2e timing degrades with non-Playwright jobs alongside (per-container `--cpus` caps, or more VM CPUs); Playwright queue wait becomes a bottleneck (bigger VM, or a second dedicated slot with fewer workers); pool moves off one shared VM; slot-1 outages strand e2e often enough to justify an `e2e` check in `runner-health.yml`.
