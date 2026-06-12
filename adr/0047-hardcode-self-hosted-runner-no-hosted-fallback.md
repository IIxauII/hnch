# ADR-0047: Hardcode self-hosted runner labels; drop the `LINUX_RUNNER` hosted-fallback toggle

**Status:** Accepted
**Date:** 2026-06-12

Supersedes the runner-targeting mechanism of [ADR-0037](0037-self-hosted-runner-pool-covers-all-non-health-jobs.md). The *coverage* decision of ADR-0037 (every Linux job except `runner-health.yml` runs on the M4 Podman pool) stands; only the indirection through `vars.LINUX_RUNNER` and its `ubuntu-latest` fallback is removed.

## Context

- ADR-0037 routed all Linux jobs via `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}` — a one-command rollback to GitHub-hosted if the pool dies.
- The toggle was never exercised. Pool-down recoveries (e.g. 2026-06-12, host shut down for days) were resolved by powering the Mac mini back on, not by flipping the var.
- ADR-0037 itself rated the out-of-band path "not an actual operational pattern" and was never promoted past `Status: Proposed`.
- The pool is single-arch arm64-linux ([ADR-0033](0033-runner-image-from-debian-and-actions-runner-tarball.md)); `deploy-relay.yml` already carries explicit cross-arch overrides. Hosted `ubuntu-latest` is x86_64 — a silent fallback would run deploy steps on a different arch than the pool they were tuned for, masking the very breakage ADR-0037 flagged as a hazard.
- Solo-dev, private repo, zero forks. No team coordination relies on a hosted escape hatch.
- `runner-health.yml` stays `ubuntu-latest` — dead-man's-switch must not run on the pool it monitors. Unchanged.

## Decision

Hardcode `runs-on: [self-hosted, linux, arm64, hnch-podman]` on every flipped job in `ci.yml`, `release.yml`, `deploy-client.yml`, `deploy-relay.yml`, `screenshots-main.yml`. Delete the `LINUX_RUNNER` repo variable. No hosted fallback for any non-health Linux job. Recovery from a dead pool is "bring the pool back" (power on the Mac mini), surfaced within the hour by `runner-health.yml`.

## Trade-offs

- Lose the one-command remote rollback. A dead pool now queues CI/release/deploy until the host is physically recovered — there is no "ship from hosted while the mini is unreachable" path.
- Lose the fat-finger guard: previously, deleting/corrupting the var silently fell back to hosted; now the labels are inline, so a typo in the labels strands jobs on a non-existent runner (caught by a queued job, not a green-on-wrong-runner).
- Re-introducing a fallback later means re-templating every `runs-on` (mechanical; the inverse of this change).

## Consequences

- Easier: `runs-on` reads literally — no expression, no var lookup, no "what is LINUX_RUNNER set to right now?" ambiguity. New Linux workflows copy a concrete label list. Deploy jobs can never silently land on x86_64 hosted.
- Harder: pool availability is now load-bearing with no software mitigation — the only lever is host uptime. A deterministic spin-up procedure for the host (see `infra/README.md`) replaces the var-flip as the recovery runbook.
- Revisit when: a dead pool blocks a time-critical release with the host unreachable (re-add a scoped fallback, or invest in host availability / a second runner); repo opens to fork PRs (hosted runners needed for untrusted PRs — addendum ADR); team grows past solo (ADR-0032 trigger).
