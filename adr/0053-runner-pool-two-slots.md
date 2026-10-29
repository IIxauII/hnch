# ADR-0053: Runner pool size — 2 slots, fewer than the verify lanes

**Status:** Accepted
**Date:** 2026-10-29

Partially supersedes the pool-size clause of [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md) ("pool size = `verify` matrix lane count"). Rest of ADR-0049 and [ADR-0052](0052-single-e2e-runner-slot.md) unchanged. Plan: [hosting plan, Decisions resolved](../docs/plans/cloudflare-hosting.md#decisions-resolved).

## Context

- ADR-0049 sized the pool to the `verify` matrix: 4 lanes (`shared`, `relay`, `client`, `cli`) → 4 slots.
- Live LaunchAgent plist runs `POOL_SIZE=2`; repo plist said 4 until 2026-10-29.
- All slots share one podman VM (`hnch-runner`, 8 vCPU / 10 GiB) on the M4 mini; nothing caps a container's CPU.
- ADR-0052 already limits Playwright to one slot (slot 1, `e2e` label).
- More slots on the same 8 vCPUs → more contention per job, not more throughput.
- Owner decision 2026-10-29: pool stays at 2 slots. Raising it out of scope.

## Decision

Pool runs 2 slots (`POOL_SIZE=2` in `infra/runner/dev.hnch.runner.plist`), fewer than the 4 `verify` lanes; pool size no longer tracks the lane count.

## Trade-offs

- `verify` lanes queue: 2 run at a time, so a full 4-lane run takes longer wall time.
- e2e, deploy, release and screenshot jobs compete with verify lanes for the same 2 slots.
- `timeout-minutes` counts running time only, not queue time, so queueing doesn't cause timeouts; it only delays results.

## Consequences

- Easier: at most 2 jobs on the VM's 8 vCPUs; with ADR-0052, at most one other job alongside a Playwright job; less CPU-contention flake risk.
- Harder: slower CI feedback on PRs touching many packages; a main merge's push run queues behind open PR runs.
- Revisit when: the VM gets more CPUs or per-container `--cpus` caps; queue wait becomes the CI bottleneck; the verify matrix gains or loses lanes; the pool moves off one shared VM.
