# ADR-0037: Self-hosted runner pool covers all CI/CD jobs except `runner-health.yml`

**Status:** Proposed
**Date:** 2026-04-30
**Deciders:** xau

## Context

[ADR-0032](0032-self-hosted-github-actions-runner.md) put the `verify` matrix and `e2e` job onto a pool of four ephemeral arm64 Podman containers on a Mac mini M4, while explicitly carving out `release.yml`, `deploy-relay.yml`, `deploy-client.yml`, and the cheap GitHub-API jobs (`detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`) to remain on `ubuntu-latest`. That carve-out inherited the rationale from [ADR-0029](0029-relay-deployment.md), which argued the deploy/release path "must not depend on home-network availability."

That rationale does not survive scrutiny. Both `release.yml` and the `deploy-*.yml` workflows are triggered by `push: main` (semantic-release tag emission) or by `workflow_dispatch`, and both triggers presuppose that the user can reach GitHub from the same home network the Mac mini lives on. If the home internet is down, the user cannot push, cannot merge, and cannot dispatch — so the trigger never fires regardless of where the runner lives. The "must not depend on home internet" framing was protecting against an outage scenario in which no work can be initiated in the first place. ADR-0032 inherited the same constraint and similarly loses its load-bearing force.

What remains is the residual hosted-minute spend. Today's split:

| Workflow / job | Runner | Approx. minutes / month |
|---|---|---|
| `ci.yml` → `verify` (4 lanes), `e2e` | self-hosted | 0 (already moved) |
| `ci.yml` → `detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary` | `ubuntu-latest` | small but non-zero |
| `release.yml` | `ubuntu-latest` | ~25 |
| `deploy-relay.yml`, `deploy-client.yml` | `ubuntu-latest` | ~30–50 combined |
| `runner-health.yml` | `ubuntu-latest` | low (hourly cron) |
| Dependabot updates | `ubuntu-latest` (GitHub-managed) | trivial |

The four residual `ci.yml` jobs plus `release.yml` plus the two deploy workflows are the remaining hosted-minute consumers worth moving. `runner-health.yml` cannot be moved — its purpose is to fire when the self-hosted pool is dead, which it cannot do from inside the pool it monitors (dead-man's-switch property). Dependabot is GitHub-managed and is left alone.

The repo is private, solo-dev, with zero forks today. The fork-PR fallback pattern — `if: github.event.pull_request.head.repo.full_name == github.repository` — was added in ADR-0032 to keep `verify`/`e2e` runnable on hosted runners when a fork PR cannot reach the self-hosted pool. For new flips made in this ADR, that pattern is not architecturally required: there are no forks today, and re-introducing it on the new jobs would be yaml verbosity for a defensive case that does not exist. The existing fork-PR `if:` guards on `verify`/`e2e` are retained as-is to avoid churn — they're skip-not-fallback and cost nothing.

There is one cross-architecture hazard specific to `deploy-relay.yml`. The Mac mini's runner image is arm64-linux ([ADR-0033](0033-runner-image-from-debian-and-actions-runner-tarball.md)); the IONOS VPS is x86_64-linux ([ADR-0029](0029-relay-deployment.md)). The deploy job currently runs `pnpm --filter @hnch/relay deploy --prod .deploy/relay`, which resolves optional native binaries against the build host's architecture. If a future relay dependency adds an arch-specific native module, an arm64 binary could land in the tarball and break `require()` on the VPS. Today's relay deps (`lib0`, `ws`, `y-protocols`, `yjs`) are pure JS — `ws`'s optional native accelerators (`bufferutil`, `utf-8-validate`) are filtered by host platform — so the surface is currently empty, but the hazard is structural and needs an explicit mitigation regardless. This is addressed in the decision below.

## Decision

Route every Linux GitHub Actions job to `vars.LINUX_RUNNER` except `runner-health.yml` and Dependabot. The `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}` expression is uniform across every flipped job; no fork-PR conditional is added on the new flips.

Concretely, the following workflows/jobs move to `vars.LINUX_RUNNER`:

- `ci.yml` → `detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary` (the four residual cheap jobs).
- `release.yml` → `release`.
- `deploy-client.yml` → `deploy`.
- `deploy-relay.yml` → `deploy`, with `npm_config_target_platform=linux` and `npm_config_target_arch=x64` set on the staging step that produces the production tarball, so that pnpm's optional-native resolution targets the VPS architecture rather than the runner's. A fallback `.npmrc` with `supported-architectures.os=linux` / `cpu=x64` / `libc=glibc` is documented if the env-var path proves flaky.

`runner-health.yml` stays pinned to `runs-on: ubuntu-latest` — the dead-man's-switch property makes it the one workflow that cannot live on the pool it's monitoring. Existing fork-PR `if:` guards on `verify` and `e2e` from ADR-0032 are retained unchanged.

## Options Considered

### Option A: Flip everything except `runner-health.yml` to `vars.LINUX_RUNNER`, no fork-PR fallback on the new flips (CHOSEN)

Uniform expression on every newly-flipped job; one repo-variable knob covers the whole CI/CD surface.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — pure yaml change, one expression repeated; cross-arch env on one step only |
| Cost | Zero marginal — hardware already in service; hosted minutes drop further |
| Scalability | Same as ADR-0032 — sized for solo workflow; if the team grows, ADR-0032's revisit triggers fire first |
| Team familiarity | High — same `runs-on` pattern already used by `verify` and `e2e` |

**Pros:**
- Single rollback toggle covers everything — `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'` flips every job back to `ubuntu-latest` in one command, with no PR.
- Hosted-minute spend drops to near-zero (`runner-health.yml` cron + Dependabot only).
- Fewer divergent runner-location decisions to keep in mind — there is exactly one carve-out and the reason for it is explicit.
- No yaml branching for fork PRs that don't exist; the `if:` guards on `verify`/`e2e` already cover the contingency for those two jobs without forcing the same pattern on the new flips.

**Cons:**
- Retires the home-internet-independence rationale from ADR-0029 explicitly. If the implicit assumption ever turned out to be wrong (e.g., the user wants to dispatch a release from a phone on cellular while the home network is down), every workflow except `runner-health.yml` is now affected, not just `verify` and `e2e`.
- Mac mini load increases by approximately 3–5 short jobs per active day (release + 1–2 deploys per merge, each ~1–2 minutes). Small in absolute terms but not zero.
- `NPM_TOKEN` (and `RELEASE_TOKEN`, already self-hosted-equivalent via the existing pattern) now flow into self-hosted containers per release run. Container is destroyed after the job ([ADR-0032](0032-self-hosted-github-actions-runner.md): "Each container handles exactly one job and is destroyed afterward"), so the credential lifetime is one job — but the credential surface has expanded relative to ADR-0032's stated scope.
- Cross-arch hazard for `deploy-relay.yml` is a permanent maintenance item. The mitigation (env vars on the staging step) is only effective if it survives future edits to the deploy workflow.

### Option B: Stop at the four cheap `ci.yml` jobs; keep `release.yml` and `deploy-*.yml` on `ubuntu-latest`

What an earlier draft of this plan proposed. Move only the small GitHub-API jobs; preserve ADR-0029's posture on release/deploy as written.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lower — touches only `ci.yml` |
| Cost | Modest hosted-minute saving (the four small jobs are already small); the bulk of the residual spend stays on hosted runners |
| Scalability | Same as today |
| Team familiarity | High |

**Pros:**
- Smallest possible blast radius — preserves ADR-0029's home-internet-independence framing intact.
- No cross-arch hazard introduced on `deploy-relay.yml`.
- No new credential surface on self-hosted runners (`NPM_TOKEN` stays on `ubuntu-latest`).

**Cons:**
- Leaves the largest remaining hosted-minute consumers (release ~25 min/mo, deploys ~30–50 min/mo) on `ubuntu-latest` without a load-bearing reason — the rationale that put them there has been retired.
- Two carve-outs to remember (release/deploys plus `runner-health.yml`) instead of one.
- Future hosted-minute pressure from Phase 6b's macOS billing (10× rate on private repos per [ADR-0032](0032-self-hosted-github-actions-runner.md)) lands against a budget that still includes release/deploy minutes that did not need to be there.

### Option C: Also move `runner-health.yml` to self-hosted

Maximum consolidation — every workflow on the pool, no carve-outs.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low yaml change, fatal logic flaw |
| Cost | Trivially lower hosted-minute spend |
| Scalability | N/A |
| Team familiarity | High |

**Pros:** zero hosted-minute spend; one runner location for everything.

**Cons:** defeats the point of the workflow. `runner-health.yml`'s purpose is to alert when the self-hosted pool is dead. Running it on the pool it's monitoring means a dead pool produces no failure signal — the workflow simply never schedules, which looks identical to "no problem detected" in the Actions UI. Rejected.

### Option D: Flip everything but require a conditional fork-PR fallback (`(fork PR && ubuntu) || self-hosted`) on the new flips too

Defense in depth: even though there are no forks today, encode the same pattern that ADR-0032 used for `verify`/`e2e` on every newly-flipped job.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Higher — yaml branching on every flipped job |
| Cost | Same as Option A |
| Scalability | Same as Option A |
| Team familiarity | Medium — pattern exists but is verbose to repeat |

**Pros:**
- Future-proof for a hypothetical scenario in which the repo opens to external contributors and fork PRs start firing CI.
- Symmetric with the existing pattern on `verify`/`e2e`.

**Cons:**
- The repo is private and solo-dev with zero forks today. Encoding fork-PR fallback yaml on `release.yml` and `deploy-*.yml` is defensive verbosity for a case that requires `pull_request_target` or a maintainer-approved workflow run anyway, neither of which is in scope for v1.
- If the repo ever opens up, an addendum ADR + a yaml pass to add the conditional is straightforward; the absence of the fallback today does not block that path.

Rejected as the default; documented here so the addendum trigger is explicit.

## Trade-off Analysis

The home-internet-independence rationale that originally protected `release.yml` and `deploy-*.yml` is being retired explicitly. The reasoning is straightforward: if the user cannot reach GitHub, no `push: main` lands, no semantic-release tag is minted, no `workflow_dispatch` is invoked — the trigger fails first, before the runner location ever matters. ADR-0029's framing was protecting against an outage scenario in which no work can be initiated, which makes the protection redundant. The same logic applies to ADR-0032's deploy/release carve-out, which was a direct inheritance.

What we explicitly give up by retiring the framing:

- **A theoretical out-of-band dispatch path.** If the user ever needed to dispatch a release from a phone on cellular while the home Mac mini was down, the workflow would queue against an offline pool until the rollback toggle is flipped. Mitigation: the toggle is a single command, the `runner-health.yml` cron raises the alarm within an hour, and dispatch from outside the home network is not an actual operational pattern today.

- **A small but real increase in mini load.** Approximately 3–5 short jobs per active day on top of the existing `verify` + `e2e` profile from ADR-0032. The ADR-0032 RAM gate (pre-Phase-9 p95 measurement) was sized against the four-runner pool only; the new jobs are short, sequential (release → deploy is a chain, not parallel), and don't add a fifth concurrent slot. The gate measurement methodology in ADR-0032 still applies and the headroom impact is small.

- **A cross-arch artifact hazard on `deploy-relay.yml`.** Mitigated by the env vars on the staging step. The mitigation is only effective if it survives future yaml edits — `infra/README.md` will document the constraint and the smoke test (`curl -fsS https://hnch.dev/health`) is the existing safety net. A regression that the smoke test misses (silent runtime breakage) is in the revisit-triggers list.

- **A wider credential surface.** `NPM_TOKEN` now reaches a self-hosted container per release run. The container is single-use and destroyed afterward (ADR-0032's "ephemeral, one-job-then-destroyed" property), so the credential lifetime is bounded the same way `RELEASE_TOKEN` already is — but the count of secret types that touch self-hosted has grown by one. Acceptable given the ephemerality and the rootless-top-to-bottom posture from ADR-0032.

What we get back:

- **A single rollback toggle for the entire CI/CD surface.** One `gh variable set` flips every workflow back to `ubuntu-latest` if the mini becomes a chronic problem. This is a strictly more useful posture than the prior split, where flipping the toggle covered only some workflows.
- **No more divergent runner-location decisions to remember.** One carve-out (`runner-health.yml`), one reason (dead-man's-switch). New workflows added in the future inherit the default expression by convention.
- **Hosted-minute spend that drops to roughly the cron + Dependabot floor**, leaving comfortable headroom for any future hosted-runner need (e.g., a macOS hosted runner if the Tart path in ADR-0032's Phase 9 falls through).

## Consequences

**Easier:**

- Hosted-minute usage drops to near-zero for all interactive workflows; only `runner-health.yml` and Dependabot consume against the cap.
- A single `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'` rolls back the entire CI/CD surface — no per-workflow yaml edits during an incident.
- Adding a new Linux workflow defaults to the self-hosted pool by convention; the only special case to remember is "if it's a health check, pin `ubuntu-latest`."
- Cost trajectory for Phase 6b (native iOS, 10× macOS billing on private repos) is more comfortable because the Linux side is now near-zero spend.

**Harder:**

- The cross-arch deploy mitigation is a permanent maintenance burden on `deploy-relay.yml`. Regressions where someone removes or relocates the env vars are caught only by the relay smoke test (`curl -fsS https://hnch.dev/health`), not by `verify`. `infra/README.md` documents the contract, but documentation is not enforcement.
- A release tarball can be half-shipped if the mini reboots mid-deploy. Recovery is the existing rollback runbook in [ADR-0029](0029-relay-deployment.md): `ln -sfn /opt/hnch-relay/releases/<prior> /opt/hnch-relay/current && sudo systemctl restart hnch-relay`. Re-dispatching `deploy-relay.yml` with `--ref <tag>` from the Actions UI re-runs the deploy idempotently. Half-shipped state is recoverable but no longer impossible.
- `NPM_TOKEN` flows through self-hosted containers per release run. Same ephemerality posture as `RELEASE_TOKEN` already has, but it expands the set of secret types ever resident on the mini's runner host. Rotation cadence (and the procedure documented in `infra/README.md`) now covers this token too.
- The four-runner pool sizing was originally chosen for `verify`'s four lanes ([ADR-0032](0032-self-hosted-github-actions-runner.md)). Adding release/deploy load is sequential rather than concurrent (release → deploy is a tag-driven chain), so the pool size remains correct — but if release and deploy ever run truly concurrently (e.g., a relay tag and a client tag landing back-to-back), brief queueing on the pool is possible.

**Revisit triggers:**

- **≥1 deploy or release run blocked by a mini-side issue per quarter.** If the rollback toggle is being used during release windows, the cost-benefit of self-hosting `release.yml` and `deploy-*.yml` has flipped relative to the smaller blast radius of Option B. The next ADR would either move just those workflows back to `ubuntu-latest` (re-introducing the carve-out for narrower reasons) or invest in mini availability (UPS, wired uplink, etc.).
- **A cross-arch artifact regression that the relay smoke test misses.** Silent runtime breakage on the VPS — the deploy lands, `/health` returns 200, but a code path the smoke test doesn't exercise fails. Either move `deploy-relay.yml` back to `ubuntu-latest` for safety, or invest in a deeper post-deploy probe.
- **Repo opening to external contributors / forks.** The fork-PR fallback was deliberately omitted on the new flips because there are no forks today. If the repo goes public or accepts fork PRs, every newly-flipped job needs a follow-up ADR (or addendum) restoring the conditional pattern on the workflows that fork PRs can trigger.
- **Team grows past one developer.** Same trigger as ADR-0032 — the pool sizing is solo-developer-shaped. Adding a second active developer pushes the pool toward queueing; release/deploy load on top of `verify`/`e2e` makes that queueing more visible than it would have been before this ADR.

## Action Items

Phased rollout per the plan file (`/Users/xau/.claude/plans/unified-squishing-rossum.md`):

- [ ] **Phase 1 — flip `ci.yml` residuals.** Update `runs-on` on `detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`. Open a no-op PR; confirm all four small jobs report `aarch64` runner via the existing `Runner identity` step pattern; merge.
- [ ] **Phase 2 — flip `release.yml`.** Update `runs-on` on the `release` job; add a `Runner identity` step. Trigger via a releasable-scope commit and confirm semantic-release runs to completion on self-hosted.
- [ ] **Phase 3 — flip `deploy-client.yml`.** Static-asset deploy, no cross-arch concern. Update `runs-on`, add `Runner identity` step, confirm dispatched deploy lands on the VPS and smoke passes.
- [ ] **Phase 4 — flip `deploy-relay.yml` with cross-arch env applied.** Update `runs-on`. Add `npm_config_target_platform=linux` / `npm_config_target_arch=x64` to the "Stage production bundle" step. Add `Runner identity` step. Verify with a `chore(relay):` no-op commit that mints a `relay-vX.Y.Z+1` tag — runner is arm64, tarball contains no arm64 native binaries (`tar -tzf hnch-relay-*.tar.gz | grep -E '\.node$'` is empty), VPS deploys cleanly, `curl -fsS https://hnch.dev/health` passes.
- [ ] **Phase 5 — observe.** After 1 week of clean runs, snapshot Actions usage via `gh api /user/settings/billing/actions`. Record the realized hosted-minute spend in `infra/README.md` so the trajectory is documented.
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-line entry referencing this ADR; update the existing ADR-0029 / ADR-0032 entries to reflect that the runner-location piece now points at ADR-0037. Flag for orchestrator — the ADR author cannot edit `CLAUDE.md` directly.
- [ ] Update `infra/README.md` "Self-hosted runner pool" intro to list every workflow now on the pool, with `runner-health.yml` called out as the exception and *why* (dead-man's-switch property — cannot run on the pool it monitors). Add a short subsection on the cross-arch deploy mitigation: the env-var contract, what to check if a relay deploy fails (verify env vars survived the workflow yaml; `podman image inspect` confirms runner is arm64; smoke-test output), and the `.npmrc` fallback.
- [ ] **Revisit watch.** Track quarterly whether the rollback toggle is being used for mini-side reasons during release/deploy windows. If yes, draft the carve-back ADR before the next quarter.

## Cross-references

- [ADR-0029](0029-relay-deployment.md) — relay deployment mechanism (ssh / symlink / systemd) is unchanged; only the runner location for `deploy-relay.yml` is partially superseded by this ADR.
- [ADR-0032](0032-self-hosted-github-actions-runner.md) — self-hosted runner pool architecture (ephemeral arm64 Podman pool, supervisor, LaunchAgent, `vars.LINUX_RUNNER` toggle, Tart deferral, `runner-health.yml` on `ubuntu-latest`) is unchanged; this ADR extends the scope of jobs routed to the pool.
- [ADR-0033](0033-runner-image-from-debian-and-actions-runner-tarball.md) — runner image base (debian-slim + official actions/runner tarball) is unchanged.
