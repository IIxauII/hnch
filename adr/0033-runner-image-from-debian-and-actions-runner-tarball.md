# ADR-0033: Runner image built from `debian:bookworm-slim` + the official `actions/runner` tarball (refines ADR-0032 §base-image)

**Status:** Proposed
**Date:** 2026-04-29
**Deciders:** xau

## Context

[ADR-0032](0032-self-hosted-github-actions-runner.md) (Proposed, merged in PR #30 a few minutes before this ADR was drafted) established the self-hosted runner architecture: four ephemeral, rootless, arm64-native Podman containers on the Mac mini M4, supervised by a per-user `LaunchAgent`, registered with `EPHEMERAL=true` and torn down after one job each. That ADR named a specific base image — `myoung34/github-runner:2.321.0` — as the foundation those containers would be built on. From ADR-0032's "Decision":

> "...four ephemeral containers built from a pinned `myoung34/github-runner` base (Node 22 + pnpm + Playwright system libs baked in)..."

After ADR-0032 was accepted but before any of the runner image work shipped, the base-image choice was re-examined under the supply-chain lens that the rest of ADR-0032 already applies to PATs and registration tokens. The relevant facts about `myoung34/github-runner`:

- It is a **personal Docker Hub image** maintained by Mark Young, MIT-licensed, ~3.5k stars on GitHub, single-maintainer.
- The image is, in substance, the official `actions/runner` Linux tarball plus a ~50-line bash entrypoint that performs the registration handshake (`config.sh --unattended --ephemeral` followed by `run.sh`), parameterized by a stable env-var contract (`REPO_URL`, `RUNNER_TOKEN`, `RUNNER_NAME`, `LABELS`, `EPHEMERAL`, etc.).
- The wrapper is small. The trust hop it adds is not.

The trust ledger for the original choice is:
1. Debian (the ultimate base layer of `myoung34/github-runner`'s `ubuntu` parent).
2. GitHub (the `actions/runner` tarball).
3. **A personal Docker Hub account** (the wrapper image, including whatever build-time apt-installs and entrypoint logic the maintainer ships per release).
4. Our own Dockerfile on top of (3).

Every job in our pool runs jobs that touch source code, registration tokens, and a pnpm cache that's bind-mounted from the host. The cost of removing trust hop (3) is ~30 lines of bash that we already understand (we have to read the upstream entrypoint to know our env-var contract anyway) plus ~20 lines of Dockerfile. The cost of keeping it is a recurring "is this maintainer still around, is the image still being signed, did the env-var names change at the last bump" question that we'd have to answer at every bump.

The rest of ADR-0032's architecture is unaffected by this choice. The container lifecycle (one job per container, deregister on exit), the supervisor on the host, the rootless top-to-bottom posture, the fork-PR `if:` guard, the `vars.LINUX_RUNNER` toggle, and the Phase 9 Tart deferral are all orthogonal to which base image the container is built from. This ADR refines exactly one line of ADR-0032's "Decision" — the base image — and explicitly leaves everything else in ADR-0032 standing.

## Decision

Build the runner container image from `debian:bookworm-slim` plus the official `actions/runner` Linux arm64 release tarball, downloaded directly from `github.com/actions/runner/releases/v<version>` and **sha256-verified at build time** against a pinned digest passed in as a Dockerfile `ARG`. Write our own ~30-line `entrypoint.sh` that performs the registration handshake (`./config.sh --unattended --ephemeral --disableupdate` followed by `./run.sh`) using an env-var contract we own.

While we are rewriting the Dockerfile anyway, **bump the runner version to `v2.334.0`** (latest as of 2026-04-29), replacing the `2.321.0` named in ADR-0032.

This ADR does **not** change anything else in ADR-0032 — pool size, ephemerality, supervisor design, PAT handling, rollback toggle, Tart deferral, and revisit triggers all stand as written.

## Options Considered

### Option A: `debian:bookworm-slim` + official `actions/runner` tarball + our own entrypoint (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — ~30 lines of bash entrypoint, ~20 lines of Dockerfile beyond base |
| Cost | Zero marginal |
| Scalability | Same as ADR-0032 (sized to four-lane verify matrix) |
| Team familiarity | High — Debian + bash + curl + sha256sum are baseline |
| Trust ledger | Debian project + GitHub + our own ~30 lines |

**Pros:**
- Removes one trust hop (the personal Docker Hub wrapper) entirely.
- Env-var contract is ours — no "verify `LABELS` vs `RUNNER_LABELS` at upstream bump" friction.
- Version bumps are explicit and auditable: a PR that updates `RUNNER_VERSION` ARG and `RUNNER_SHA256` ARG, with the sha256-lookup procedure documented in `infra/README.md`.
- `debian:bookworm-slim` is one of the smallest, most-audited base images in common use.
- sha256-verifying the tarball at build time means a tampered release would fail the build, not run silently.

**Cons:**
- ~30 lines of `entrypoint.sh` and ~20 lines of Dockerfile are now ours to maintain.
- We must bump `RUNNER_VERSION` ourselves — no upstream image-tag notification. Mitigation: either add a Dependabot ecosystem entry that watches the Dockerfile, or document a monthly review cadence in `infra/README.md`.
- We have to install Node + pnpm + Playwright system libs ourselves on top of `debian-slim` (the `myoung34` image bakes Node in). This is straightforward apt + corepack.

### Option B: `node:22-bookworm-slim` + official tarball + our own entrypoint

Same shape as Option A, but starts from `node:22-bookworm-slim` so Node is already present.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Zero marginal |
| Scalability | Same |
| Team familiarity | High |
| Trust ledger | Debian project + Node project + GitHub + our entrypoint |

**Pros:** Skips the apt-install of Node. Official `node` images are well-maintained and widely used.

**Cons:** Adds the Node project as a trust hop for a benefit (skipping `apt-get install -y nodejs`) that is one line of Dockerfile. The `node:22-bookworm-slim` image is also ~3× the size of `debian:bookworm-slim` because it ships the full Node toolchain, npm, and a non-trivial set of build deps. The trade is a strictly worse trust/size profile for a marginal Dockerfile-line saving. **Rejected.**

### Option C: `myoung34/github-runner:<digest>` (the original ADR-0032 choice)

Stay with the personal Docker Hub image as ADR-0032 originally specified, with digest pinning and the existing ephemeral / non-`--privileged` posture as the mitigations.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest — inherits a working entrypoint |
| Cost | Zero marginal |
| Scalability | Same |
| Team familiarity | Medium — the env-var contract is upstream's, must be re-verified at each bump |
| Trust ledger | Debian + GitHub + personal Docker Hub maintainer + our Dockerfile |

**Pros:** Smallest amount of code we own. Inherits a well-tested registration handshake. Digest-pinning + the per-job ephemeral lifecycle + non-`--privileged` execution genuinely do limit blast radius.

**Cons:** The wrapper is ~50 lines of bash; replicating it costs us ~30 lines of bash (we collapse a few options we don't need). Paying a permanent personal-maintainer trust hop to save 30 lines of code that we'd want to read anyway is the wrong default. Mitigations (digest pin, ephemerality, non-privileged) reduce the blast radius of a compromised image but do not eliminate it — the image still runs in our pool, sees our registration tokens, and bind-mounts our pnpm cache. **Rejected on principle:** the wrapper is small enough that owning it is cheaper than auditing it on every bump.

### Option D: `summerwind/actions-runner` (used by `actions-runner-controller`)

The runner image consumed by `actions-runner-controller`, the canonical Kubernetes-native runner project.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Zero marginal |
| Scalability | Same |
| Team familiarity | Low |
| Trust ledger | Debian + GitHub + summerwind/ARC project + our Dockerfile |

**Pros:** Backed by a more institutional project than `myoung34`; well-maintained.

**Cons:** Same trust-hop shape as Option C — a third-party wrapper around the official tarball — but is also explicitly designed for Kubernetes-controller-driven lifecycle, not standalone Podman. Using it standalone means working around the controller-oriented entrypoint logic. Worse fit, same trust hop. **Rejected.**

### Option E: `ubuntu:22.04`

Match GitHub's `ubuntu-latest` parent OS exactly.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Zero marginal |
| Scalability | Same |
| Team familiarity | High |
| Trust ledger | Canonical (Ubuntu) + GitHub + our entrypoint |

**Pros:** Closest possible parity to GitHub-hosted `ubuntu-latest` if a future dependency ever requires a specifically-Ubuntu detail.

**Cons:** ~150 MB larger than `debian:bookworm-slim`, slower apt resolution, and the parity benefit is hypothetical — `actions/runner` itself is identical on both, and the apt packages we install (Node, pnpm, Playwright system libs) are the same on Debian as on Ubuntu. **Rejected:** size and pull-time cost without functional benefit.

### Option F: `alpine`

Smallest possible base.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — musl libc compatibility surprises |
| Cost | Zero marginal |
| Scalability | Same |
| Team familiarity | Medium |
| Trust ledger | Alpine + GitHub + our entrypoint |

**Pros:** Smallest image footprint of all options.

**Cons:** Playwright Chromium binaries are glibc-only; running them on musl libc requires a glibc compatibility layer (`gcompat`) that defeats the size advantage and is a known source of subtle breakage. **Rejected** on Playwright incompatibility — the `e2e` lane is one of the two reasons this whole ADR-0032 architecture exists.

## Trade-off Analysis

Option A wins because removing the personal-maintainer trust hop is worth the ~50 lines of code we take on. ADR-0032 already establishes that the supply-chain posture for this runner pool is non-trivial — fine-grained PAT, host-side Keychain storage, per-job tokens that never enter the container, digest-pinned base image. Adding a personal Docker Hub maintainer to the trust ledger when the cost of removing them is one Dockerfile and one entrypoint script is inconsistent with the rest of that posture.

What we give up:

- **More code to maintain ourselves.** ~30 lines of `entrypoint.sh` plus ~20 lines of Dockerfile beyond what we'd have if we inherited from `myoung34/github-runner`. Both are small, both are bash/Dockerfile (not specialized), and both are exercised on every CI run so regressions surface fast.
- **No upstream notification on runner bumps.** When `actions/runner` releases a new version, we won't see a Dependabot bump on a Docker tag. Mitigation: either add a Dockerfile-aware Dependabot ecosystem entry (Dependabot supports parsing `ARG`-style version pins for some ecosystems but not all — needs verification), or document a monthly cadence in `infra/README.md` to check `https://github.com/actions/runner/releases/latest`.
- **A small one-time cost to look up the sha256 of each new tarball.** Procedure: `curl -L https://github.com/actions/runner/releases/download/v<version>/actions-runner-linux-arm64-<version>.tar.gz.sha256` (GitHub publishes the digest alongside the tarball on the release page). To be documented step-by-step in `infra/README.md` so the bump procedure is mechanical.

What we explicitly do **not** give up:

- **The ephemeral-per-job lifecycle, the rootless posture, the supervisor model, the PAT-never-enters-container architecture, the rollback toggle, or the Tart deferral.** All of those are properties of ADR-0032's architecture, not properties of the base image. They survive this refinement unchanged.
- **The four-lane pool sizing.** Same as ADR-0032 — sized to the verify matrix.

## Consequences

**Easier:**

- One fewer trust hop to audit at each runner bump. The supply-chain dependencies for our runner image become: the Debian project (`debian:bookworm-slim` from the official Docker `library/` namespace), GitHub (the `actions/runner` tarball, with sha256 published alongside the release and verified at build time), and our own ~30-line entrypoint.
- Env-var contract is ours, named consistently with the rest of `infra/runner/`. No "did `LABELS` become `RUNNER_LABELS` at upstream's last release" surprises.
- Runner-version bumps are visible in `git log` as a Dockerfile change with both `RUNNER_VERSION` and `RUNNER_SHA256` updated together — auditable in PR review the same way an npm dependency bump is.

**Harder:**

- ~50 lines of Dockerfile + entrypoint code that are ours to maintain, and that we have to remember to keep in sync with `actions/runner`'s actual interface. The interface has been stable across many versions; the cost is small and the mitigation is automated build verification (the entrypoint runs on every CI job, so a break is loud).
- We must remember to bump `RUNNER_VERSION` ourselves. Without a Dependabot integration, this falls to a documented monthly review cadence in `infra/README.md`. If we forget, the runner stays on an older but pinned-and-verified version — degraded freshness, not broken security.

**Revisit triggers:**

- **`entrypoint.sh` accumulates non-trivial logic (>~100 lines).** If we end up reimplementing significant chunks of the upstream wrapper (proxy support, custom registration retry, complex token refresh), the cost-benefit of owning it ourselves shifts. At that point, reconsider Option C with explicit digest-pinning and a documented "audit the upstream entrypoint diff at each bump" step.
- **GitHub publishes an official Docker image for the runner.** GitHub has historically published only the tarball, not an official container image. If they ship one, switch to it — it eliminates both our wrapper code and the third-party trust hop in one move.
- **The sha256-verified tarball ever fails to verify at build time.** Treat as a security event, not a bump glitch: stop the bump, audit the GitHub release page for republication or compromise indicators, and only proceed once the discrepancy is explained. Document the incident response in `infra/README.md`.
- **A Playwright or Node dep ever hard-requires Ubuntu specifically.** Reconsider Option E (`ubuntu:22.04`). This has not happened to date and is unlikely, but is the one realistic case for moving off Debian.

## Action Items

- [ ] Implement `infra/runner/Dockerfile` per Option A: `FROM debian:bookworm-slim`, `ARG RUNNER_VERSION=2.334.0`, `ARG RUNNER_SHA256=<digest>`, apt-install Node 22 + pnpm + Playwright system libs, `curl` + `sha256sum -c` the runner tarball, extract to `/runner`, copy in `entrypoint.sh`, set `USER 1000`.
- [ ] Implement `infra/runner/entrypoint.sh` (~30 lines): consume `REPO_URL`, `RUNNER_TOKEN`, `RUNNER_NAME`, `RUNNER_LABELS` env vars; run `./config.sh --unattended --ephemeral --disableupdate --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "$RUNNER_NAME" --labels "$RUNNER_LABELS"`; exec `./run.sh`. Trap exits to ensure `config.sh remove` runs on signal.
- [ ] Document the sha256-lookup procedure in `infra/README.md` ("Bumping the runner version" section): the `releases/download/v<version>/actions-runner-linux-arm64-<version>.tar.gz.sha256` URL, the verification command, and a worked example.
- [ ] Document the monthly bump cadence in `infra/README.md` (until/unless a Dependabot ecosystem entry is added that watches Dockerfile `ARG` pins).
- [ ] Investigate whether Dependabot's Dockerfile ecosystem supports tracking versioned tarballs via `ARG` — if so, add a `.github/dependabot.yml` entry; if not, document why and rely on the monthly cadence.
- [ ] Update `plans/plan-self-hosted-runner.md` Phase 2 ("runner image") to reference this ADR for the base-image choice and the runner version (`v2.334.0`, not `v2.321.0`).
- [ ] When this ADR is accepted, update `CLAUDE.md` "Current decisions at a glance" so the runner entry references both ADR-0032 and ADR-0033 for the image-stack provenance (the ADR author cannot edit `CLAUDE.md` directly — flag for orchestrator).
