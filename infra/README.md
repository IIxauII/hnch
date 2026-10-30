# infra/ — self-hosted CI runner pool

Configuration for the self-hosted GitHub Actions runner pool, checked into the repo so the host can be rebuilt deterministically.

Production hosting is on Cloudflare (`hnch-web` and `hnch-relay`, [ADR-0051](../adr/0051-cloudflare-hosting.md)) and needs no files here; see [`docs/deployment.md`](../docs/deployment.md). The IONOS VPS files (Caddyfile, systemd unit, bootstrap script, deploy key) were removed by [ADR-0054](../adr/0054-vps-decommission.md); git history has them.

## Self-hosted runner pool

Every Linux job except the two carve-outs below runs on a pool of 2 ephemeral arm64 Podman containers on a Mac mini M4 — the `ci.yml` `verify` matrix, `e2e`, the small support jobs (`detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`), plus `release.yml`, `deploy-client.yml`, `deploy-relay.yml` and `screenshots-main.yml`. Labels are hardcoded `[self-hosted, linux, arm64, hnch-podman]` (plus `e2e` on the two Playwright jobs, see [E2E slot](#e2e-slot)); there is no hosted fallback. `runner-health.yml` stays on `ubuntu-latest` permanently — it is the dead-man's-switch that fires when the pool is dead, so it cannot run on the pool. `cancel-merged-pr-ci.yml` also stays hosted (a `gh api` call that must not queue behind the pool). Dependabot stays on the GitHub-managed runner.

See [ADR-0049](../adr/0049-self-hosted-runner-pool-current-state-consolidation.md) for the current-state rationale (it consolidates and supersedes the ADR-0032 / 0033 / 0037 / 0047 chain) and [ADR-0053](../adr/0053-runner-pool-two-slots.md) for the pool size. Source plan: `plans/plan-self-hosted-runner.md`.

### Architecture

```
GitHub Actions
   │
   ▼ register/run
hnch-podman label → 2 ephemeral containers on M4 (POOL_SIZE=2)
   │
   ├── built from infra/runner/Dockerfile (debian:bookworm-slim + official actions/runner tarball + Node 22 + pnpm + Playwright libs)
   ├── one job per container, --rm, EPHEMERAL=true (deregisters and exits after the job)
   ├── arm64 native, rootless top-to-bottom, --userns=keep-id
   └── supervised by infra/runner/supervisor.sh under launchd (dev.hnch.runner.plist)
```

Runners are repo-scoped and labelled `self-hosted,linux,arm64,hnch-podman`; slot 1 also carries `e2e` (see [E2E slot](#e2e-slot)). The pool runs 2 slots (`POOL_SIZE=2` in `dev.hnch.runner.plist`), so the 5 verify lanes (`shared`, `relay`, `client`, `cli`, `e2e`) share 2 runners and queue ([ADR-0053](../adr/0053-runner-pool-two-slots.md)).

### Files

| File | Purpose |
|---|---|
| `infra/runner/Dockerfile` | Runner container image (digest-pinned base + Node 22 + pnpm + Playwright deps) |
| `infra/runner/supervisor.sh` | Pool maintainer: fetches 1-hour registration tokens on host, spawns containers, crashloop backoff |
| `infra/runner/dev.hnch.runner.plist` | LaunchAgent for the supervisor (RunAtLoad, KeepAlive, ThrottleInterval=30) |
| `infra/runner/prune.sh` | Weekly cache eviction script (per-runner pnpm stores, image prune, log truncation, disk-low alarm) |
| `infra/runner/dev.hnch.runner-prune.plist` | LaunchAgent that fires `prune.sh` Sunday 04:00 |
| `.github/workflows/runner-health.yml` | Every-6-h `ubuntu-latest` cron — fails if no `hnch-podman` runner is online, or no online one carries `e2e` (slot 1) |

### Worktree-independent install location

The plists reference `~/.local/bin/hnch-runner-{supervisor,prune}.sh`, not the in-repo path. This is forced by macOS TCC (launchd cannot execute scripts under `~/Documents`) and has the side effect of decoupling the LaunchAgent from any specific worktree — switching branches in the primary repo or in linked worktrees does not change which script the LaunchAgent runs.

The trade-off: edits to `supervisor.sh` or `prune.sh` in the repo do not take effect until `bash infra/runner/install.sh` is re-run from the worktree containing the edits.

### One-time host setup (run on the Mac mini)

```sh
brew install podman
podman machine init --cpus 8 --memory 10240 --disk-size 80 hnch-runner
podman machine start hnch-runner

mkdir -p ~/runner-cache/{playwright,state,nm-snapshots}
for i in 1 2; do
  mkdir -p ~/runner-cache/pnpm-store-$i ~/runner-cache/work-$i
done

sudo pmset -a sleep 0 disksleep 0 displaysleep 15 womp 1 powernap 0
```

Create one `pnpm-store-N` / `work-N` pair per slot; add more if `POOL_SIZE` grows.

**UID-mapping smoke test** (must pass before continuing):

```sh
podman run --rm --userns=keep-id -v ~/runner-cache/pnpm-store-1:/cache \
  alpine sh -c 'touch /cache/from-container && ls -ln /cache/'
ls -ln ~/runner-cache/pnpm-store-1/from-container
touch ~/runner-cache/pnpm-store-1/from-host
podman run --rm --userns=keep-id -v ~/runner-cache/pnpm-store-1:/cache \
  alpine sh -c 'cat /cache/from-host && rm /cache/from-*'
```

If any step fails, drop `--userns=keep-id` from `supervisor.sh` and re-test with default mapping.

### Build the runner image

The Dockerfile builds from `debian:bookworm-slim` and downloads the official `actions/runner` tarball, sha256-verified at build time. Default version is pinned at the top of the Dockerfile (`RUNNER_VERSION` + `RUNNER_SHA256` ARGs). To build:

    cd ~/Documents/projects/hnch
    podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/

Smoke test the image:

    podman run --rm --userns=keep-id hnch-runner:latest \
      bash -c 'which git node pnpm jq gh ssh ssh-keyscan && node --version && pnpm --version && gh --version'

Note: the entrypoint requires registration env vars (`RUNNER_NAME`, `REPO_URL`, `RUNNER_TOKEN`, `LABELS`) — `podman run` without them will exit immediately with a missing-var error. The supervisor supplies them when spawning a real runner. To smoke-test the entrypoint surface only, override it: append `--entrypoint /bin/bash` to the `podman run` above.

### Provision the PAT

Issue a **fine-grained PAT** scoped to `IIxauII/hnch` only, permission `Administration: Read and write` (required by `POST /repos/.../actions/runners/registration-token` — NOT classic `repo` scope). Store in macOS Keychain — supervisor and prune scripts both read it from there at runtime, so reboot survival is automatic.

```sh
security add-generic-password -a "$USER" -s hnch-runner-pat -w
```
(prompts twice; paste the PAT — never appears in shell history)

### Install scripts and LaunchAgents

macOS TCC blocks launchd from executing scripts under `~/Documents` (and other protected locations). The plists therefore reference `~/.local/bin/`. The install script copies the supervisor and prune scripts there and drops the plists into `~/Library/LaunchAgents/`. Idempotent — re-run safe.

```sh
bash infra/runner/install.sh
```

Then load:

```sh
launchctl load ~/Library/LaunchAgents/dev.hnch.runner.plist
launchctl load ~/Library/LaunchAgents/dev.hnch.runner-prune.plist
```

Within ~30 s, `gh api /repos/IIxauII/hnch/actions/runners | jq '.runners[].labels'` should show 2 idle runners labelled `hnch-podman`.

After editing `supervisor.sh` or `prune.sh` in the repo, re-run `bash infra/runner/install.sh` to copy the changes into `~/.local/bin/`, then `launchctl kickstart -k gui/$(id -u)/dev.hnch.runner` to force fresh containers on the next spawn cycle. `install.sh` also overwrites the installed plists with the repo copies, so a host-local `POOL_SIZE` edit is lost; to update only the supervisor, run `install -m 755 infra/runner/supervisor.sh ~/.local/bin/hnch-runner-supervisor.sh` instead. `kickstart -k` removes every running container, including one mid-job, so run it while `gh run list --repo IIxauII/hnch --status in_progress` is empty.

### Runner targeting

Every Linux CI/CD job hardcodes `runs-on: [self-hosted, linux, arm64, hnch-podman]`, plus `e2e` on Playwright jobs (see [E2E slot](#e2e-slot)) ([ADR-0049](../adr/0049-self-hosted-runner-pool-current-state-consolidation.md), [ADR-0052](../adr/0052-single-e2e-runner-slot.md)). There is no `vars.LINUX_RUNNER` toggle and no `ubuntu-latest` fallback — a dead pool queues jobs until the host is back. `runner-health.yml` stays on `ubuntu-latest` as the dead-man's-switch and raises an alarm within 6 h when the pool or the e2e slot is down.

### E2E slot

All pool containers share one podman VM (8 vCPU / 10 GiB) and nothing caps a container's CPU. Two Playwright jobs at once (each 4 Playwright workers + `ng serve` + the wrangler relay) slow every step 4–5× and push tests past their 45 s budget, so only one may run at a time ([ADR-0052](../adr/0052-single-e2e-runner-slot.md)):

- `supervisor.sh` registers slot 1 (`hnch-runner-1-<epoch>`) with labels `self-hosted,linux,arm64,hnch-podman,e2e`; every other slot gets the base four. The label is re-applied on each ephemeral re-registration and on every supervisor restart, and slot 1 exists at any `POOL_SIZE`.
- Jobs that run Playwright target `runs-on: [self-hosted, linux, arm64, hnch-podman, e2e]`: `ci.yml` `e2e` and `screenshots-main.yml` `refresh`. A new workflow that runs Playwright must add `e2e` too.
- Other jobs still land on slot 1. An e2e job waits for slot 1 to finish its current job (verify ≤3 min, deploy/release ≤10 min), then for any Playwright job ahead of it (~5–8 min each). `timeout-minutes` counts from job start, so queue time doesn't eat into it; GitHub cancels a self-hosted job only after 24 h queued.
- Slot 1 down while the rest of the pool is up: e2e jobs show "Waiting for a runner to pick up this job", and the next `runner-health.yml` run (every 6 h) fails with "No online hnch-podman runner carries the e2e label". Check with `gh api repos/IIxauII/hnch/actions/runners --jq '.runners[] | select(.status=="online") | {name, labels: [.labels[].name]}'` and expect one `hnch-runner-1-*` carrying `e2e`.
- Rollout order for label changes: host first, workflows second. Install the supervisor and restart the pool so slot 1 carries `e2e` (an extra label is harmless to jobs that don't ask for it) **before pushing the PR** that adds the label to a workflow: a `ci.yml` change makes detect-changes force e2e, and a `pull_request` run uses the PR's own `ci.yml`, so that PR's e2e job already needs the label. Confirm with the `gh api …/runners` check above that an online `hnch-runner-1-*` carries `e2e`, then push. The reverse order queues every e2e job until the host catches up.
- Rollback: revert the workflows first (merge the revert), then reinstall the old supervisor and restart the pool. The reverse order strands e2e jobs waiting for a runner that no longer exists.
- This removes Playwright-vs-Playwright contention only: other slots still run verify lanes, `ng build`, wrangler dry-runs and deploy/release builds on the same 8 vCPUs while e2e runs (at most one other job at `POOL_SIZE=2`, up to three at 4).

### Recovery when the pool is down (e.g. after a reboot)

The supervisor LaunchAgent calls `podman run` but does **not** start the podman machine — on a cold boot it can fire before the machine is up, fail every spawn, and fall into a 5-minute crashloop backoff. Deterministic spin-up:

```sh
# 1. Ensure the VM is running (no-op if already up)
podman machine list --format '{{.Name}} {{.Running}}' | grep -q 'hnch-runner true' \
  || podman machine start hnch-runner

# 2. Wait until podman is actually reachable
until podman -c hnch-runner info >/dev/null 2>&1; do sleep 2; done

# 3. Kick the supervisor so it spawns now instead of waiting out any backoff
launchctl kickstart -k gui/$(id -u)/dev.hnch.runner
```

Within ~30 s, `gh api /repos/IIxauII/hnch/actions/runners --jq '.runners[].name'` should list 2 runners; queued jobs drain automatically.

### Bumping the runner base image

The Dockerfile pins both the runner version and the tarball sha256. Bumping is two ARG edits:

1. Look up the latest release:

       gh release view --repo actions/runner --json tagName --jq .tagName

2. Look up the arm64 sha256 from the release body:

       gh release view --repo actions/runner v<VERSION> --json body \
         --jq .body | grep -A1 "linux.*arm64"

   The sha256 is wrapped in `<!-- BEGIN SHA linux-arm64 -->...<!-- END SHA linux-arm64 -->` markers.

3. Update both ARGs in `infra/runner/Dockerfile`, rebuild, and force a fresh spawn:

       podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/
       launchctl kickstart -k gui/$(id -u)/dev.hnch.runner

Bump cadence: monthly, or sooner if a security advisory is published.

There is no separate base-image bump — `debian:bookworm-slim` is intentionally pinned by tag (not digest) because it gets regular security patches and rebuilding picks them up. Inspect `podman image inspect debian:bookworm-slim` after a bump if you want to record the pulled digest for audit.

### Rotating the PAT

```sh
security add-generic-password -U -a "$USER" -s hnch-runner-pat -w
launchctl kickstart -k gui/$(id -u)/dev.hnch.runner
```
The `-U` flag updates the existing Keychain entry in place. Supervisor re-reads the PAT on next supervisor startup, so `kickstart -k` is enough — no unload/load cycle needed.

### Logs

- Supervisor stdout/stderr: `~/Library/Logs/hnch-runner.{out,err}.log`.
- Prune stdout/stderr: `~/Library/Logs/hnch-runner-prune.{out,err}.log`.
- Per-container: `podman logs <container-name>` (containers are named `hnch-runner-<idx>-<epoch>`).

### Cache poisoning runbook

If a job leaves a corrupted pnpm store or Playwright browser cache:

```sh
launchctl unload ~/Library/LaunchAgents/dev.hnch.runner.plist
podman ps -q --filter name=hnch-runner- | xargs -r podman rm -f
rm -rf ~/runner-cache/pnpm-store-* ~/runner-cache/playwright
mkdir -p ~/runner-cache/playwright
for i in 1 2; do mkdir -p ~/runner-cache/pnpm-store-$i; done
launchctl load ~/Library/LaunchAgents/dev.hnch.runner.plist
```

The supervisor reseeds caches lazily on the next job per runner.

### Pre-Phase-9 RAM gate

Before adding a Tart-based macOS runner (Phase 9, gated on Phase 6b iOS), measure 4-day p95 committed RAM with the two-slot pool at steady state. The M4's RAM is **soldered**; if p95 > 10 GB, order a higher-RAM mini *before* starting Tart work.

```sh
# crontab -e
* * * * * vm_stat | awk '/Pages active/{a=$3+0}/Pages wired/{w=$4+0} END {printf "%d %d\n", systime(), (a+w)*4/1024}' >> ~/ram.log
# After 4 days:
awk '{p[NR]=$2} END {n=asort(p); print "p95 MB =", p[int(n*0.95)]}' ~/ram.log
```

Record the result here for posterity:

| Date | p95 (MB) | Decision |
|---|---|---|
| (pending first measurement) | | |

### Health check

`.github/workflows/runner-health.yml` runs every 6 h on `ubuntu-latest` (cron `0 */6 * * *`, ~120 runs/mo, each billed as 1 min, so ~120 min/mo billable). It runs `scripts/ci/runner-health.mjs`, which calls `gh api /repos/.../actions/runners` and fails, with one `::error::` per check, if no `hnch-podman` runner is present, or if none carries the `e2e` label (the single e2e slot, see [E2E slot](#e2e-slot)). A runner counts as present when it is online or busy. Runners are ephemeral and re-register 10-30 s after each job, so a check fails only when all of five looks, 30 s apart (2 min), miss it; a healthy pool passes on the first look, a red run bills 3 min. Each look logs the full runner list (name, status, busy, labels), so a red run's log shows what was missing. Tests: `node --test scripts/ci/runner-health.test.mjs`. Failure → GitHub email notification. Manual trigger: `gh workflow run runner-health.yml`.

The workflow needs `Administration: read` to list runners. The default `GITHUB_TOKEN` cannot be granted that scope (GitHub caps `GITHUB_TOKEN` permissions and the `permissions:` block cannot escalate beyond the cap). Therefore the workflow uses a separate fine-grained PAT stored as the repo secret `RUNNER_HEALTH_PAT`. If the secret is missing, the workflow logs a warning and exits 0 — never fails the run, never spams email.

**Setup:**

1. Create a second fine-grained PAT (separate from the supervisor's runner-registration PAT, which has `Administration: read+write` — this one only needs read):
   - Resource owner: your account
   - Repository access: only `IIxauII/hnch`
   - Permissions: **Administration: Read-only**
   - Expiration: 90 days (calendar-reminder rotation)
2. Store as repo secret:
   ```sh
   gh secret set RUNNER_HEALTH_PAT --body 'github_pat_...'
   ```
3. Trigger once to verify: `gh workflow run runner-health.yml`. Should pass within a minute.

**Rotation:**

```sh
gh secret set RUNNER_HEALTH_PAT --body 'github_pat_<new-token>'
```

No workflow change required.
