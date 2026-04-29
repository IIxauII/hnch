# Self-hosted GitHub runner for hnch — Podman + Tart on Mac mini M4

## Context

The hnch repo is **private** on GitHub → 2,000 free Actions minutes/month (3,000 on Pro). Today every job runs on `ubuntu-latest`:

- `ci.yml` — detect-changes + verify matrix (shared/relay/client/cli) + version-audit + pr-title-lint + e2e (Playwright). Every push to `main`, every PR.
- `deploy-relay.yml`, `deploy-client.yml`, `release.yml` — tag-driven, SSH-only, must not depend on home internet.

Minute hogs are **verify matrix** and **e2e**. Phase 6b (native iOS) will need `macos-latest` at **10× billing** on private repos → would torch the budget alone.

Goal: shift heavy CI off GitHub-hosted onto the daily-driver Mac mini M4 **without polluting the host** (used for development daily) and **without blocking iOS builds** for Phase 6b. Keep `deploy-*` and `release.yml` on GitHub-hosted.

## Hardware decision (closed)

- **<vps-ssh-alias> (IONOS, 1 vCPU / 864 MiB / 7 GB free):** rejected — too small, co-location with prod relay = stability risk.
- **2014 MacBook Air:** rejected — macOS Monterey EOL, no modern Xcode, RAM-bound.
- **Mac mini M4 (chosen):** 10-core, 16 GB+ RAM, fast SSD, Apple Silicon → can host Podman (Linux containers) and Tart (macOS VMs) — same isolation pattern GitHub-hosted/Cirrus/MacStadium use internally.

## Existing solutions — what we reuse vs. build

The Mac-mini-at-home, Podman-Linux-plus-Tart-macOS-on-one-box pattern has no FOSS turnkey project. But its building blocks exist; the plan reuses them rather than reinventing.

| Component | Existing solution adopted | Status |
|---|---|---|
| Linux runner container image | **`myoung34/github-runner`** (multi-arch, supports `EPHEMERAL=true`) | base for our Dockerfile — we add Playwright deps + Node 22 + pnpm on top |
| Ephemeral registration handshake | inherited from `myoung34/github-runner` | no custom `entrypoint.sh` for token fetch needed |
| Pool supervisor on host | hand-rolled `supervisor.sh` (no good FOSS equivalent for Mac launchd) | small, ~50 lines |
| macOS VM (Phase 9) | **Tart** (Cirrus Labs, MIT) + `ghcr.io/cirruslabs/macos-sequoia-xcode` | standard pull-and-go |
| macOS VM orchestration (Phase 9) | **Orchard** (Cirrus Labs, AGPL) | replaces hand-rolled Tart supervisor |
| Linux runner orchestration (alt) | **`actions-runner-controller`** (k8s) | rejected — k8s overkill for one Mac mini |

Knowingly **not reused**: Anka, MacStadium Orka, AWS EC2 Mac (all paid / cloud), `runs-on.com` (paid SaaS).

## Architecture (revised after plan-critic review)

| Workload | Where | Why |
|---|---|---|
| Linux jobs (verify, e2e) | **Podman, ephemeral container per job, native arm64** | Container destroyed after one job — no env/cred/process bleed. arm64 native → no Rosetta tax. |
| iOS jobs (Phase 6b, deferred) | **Tart, macOS VM, snapshot-revert per job** | Apple license requires real macOS for Xcode. Tart = open-source standard. |
| Anything that just SSHes out | **stays on `ubuntu-latest`** | Cheap, fast, doesn't depend on home internet. |

### Architecture decisions (locked after critique)

- **arm64 native, not x64-via-Rosetta.** M4 is Apple Silicon; we run native arm64 Linux containers. Runner agent is `actions-runner-linux-arm64`, label `linux,arm64,hnch-podman`. Playwright pulls arm64 chromium.
- **Rootless top-to-bottom.** Podman runs rootless on the macOS host (no daemon, no root install), and the container runs as the non-root `runner` user (uid 1000) inherited from `myoung34/github-runner`. UID mapping across the macOS-host → Podman-VM → container boundary is non-trivial: macOS user `xau` is uid 50x (Apple-default), the Podman VM user is uid 50x (Fedora CoreOS rootless `core`), and container `runner` is uid 1000. We use `--userns=keep-id` so the VM-side user maps cleanly to container uid 1000; on the macOS side, virtiofs/9P translates back to `xau` ownership for the bind-mount caches. **This must be verified empirically before relying on it** — see Phase 1 step 5 (UID-mapping smoke test).
- **PAT never enters the container.** The supervisor fetches a short-lived (1-hour) registration token on the macOS host using the PAT, then passes only that token (`RUNNER_TOKEN`) into the container. A malicious dependency reading `/proc/self/environ` inside the container sees the registration token (worthless after one job + one hour) but never the PAT.
- **Per-runner pnpm store, not shared.** Avoids concurrent-write races and partial-write corruption from `kill -9`. Disk cost: each runner gets its own ~2 GB store, max 8 GB across 4 runners.
- **Workflow toggle via repo variable** (`vars.LINUX_RUNNER`). Switching back to `ubuntu-latest` is a one-line `gh variable set`, no PR required — critical fallback for home-network/Mac-mini outages.

## Resource budget (16 GB M4 baseline)

Sized for Podman alone (Tart deferred):

- Podman machine: `--cpus 8 --memory 10240 --disk-size 80` (8 vCPU, 10 GB RAM, 80 GB disk).
- Up to **4 concurrent ephemeral runners** (one per verify-matrix lane); peak ~2 GB each → ~8 GB Podman load.
- Daily user (Chrome + IDE + Slack): ~4–6 GB.
- Tight but fits 16 GB. Comfortable on 24/32 GB.

**Gate before Phase 9 (Tart/iOS):** measure 4-day 95th-percentile RAM with `vm_stat`. If >10 GB, RAM upgrade is required *before* Tart lands. M4 RAM is **not field-upgradable** — flag this now so future-you doesn't get stuck.

## What does NOT change

- `deploy-relay.yml`, `deploy-client.yml`, `release.yml` — stay on `ubuntu-latest`.
- `detect-changes`, `version-audit`, `pr-title-lint` — stay on `ubuntu-latest` (cheap, benefits from GH egress to api.github.com).

## Implementation plan

### Phase 1 — Mac mini host prep

1. Install Podman:
   ```sh
   brew install podman
   podman machine init --cpus 8 --memory 10240 --disk-size 80 hnch-runner
   podman machine start hnch-runner
   ```
2. Create per-runner cache dirs (4 runners × pnpm-store + per-runner workdir + shared Playwright cache):
   ```sh
   mkdir -p ~/runner-cache/{playwright,state}
   for i in 1 2 3 4; do
     mkdir -p ~/runner-cache/pnpm-store-$i ~/runner-cache/work-$i
   done
   ```
   - Playwright cache shared (read-mostly, browser binaries tagged by version; conflicts very rare).
   - pnpm store **per runner** to avoid concurrent-write races (plan-critic C6).
   - `work-$i` is bind-mounted into the container at `/actions-runner/_work` so pnpm can hardlink from the store into `node_modules` (same filesystem). Without this, pnpm silently falls back to copy and you lose most of the cache speedup.
3. Sleep / power-nap config (keeps mac usable as daily driver):
   ```sh
   sudo pmset -a sleep 0 disksleep 0 displaysleep 15 womp 1 powernap 0
   ```
4. Tart deferred to Phase 9 (Phase 6b iOS).
5. **UID-mapping smoke test** (must pass before proceeding to Phase 2):
   ```sh
   # Spawn a throwaway container, write to a bound cache dir, confirm host can read+write.
   podman run --rm --userns=keep-id \
     -v ~/runner-cache/pnpm-store-1:/cache \
     alpine sh -c 'touch /cache/from-container && ls -ln /cache/'
   # Now from macOS:
   ls -ln ~/runner-cache/pnpm-store-1/from-container
   touch ~/runner-cache/pnpm-store-1/from-host
   # Re-enter a container, verify it can read host's file:
   podman run --rm --userns=keep-id \
     -v ~/runner-cache/pnpm-store-1:/cache \
     alpine sh -c 'cat /cache/from-host && rm /cache/from-*'
   ```
   If any step fails (permission denied, ownership mismatch on either side), drop `--userns=keep-id` and re-test with default mapping; document whichever works.

### Phase 2 — Build the runner container image

Extend `myoung34/github-runner` (multi-arch, MIT, ephemeral-aware) instead of writing the runner-agent install + registration logic from scratch. The base image handles: download + extract `actions-runner-linux-arm64`, register with `--ephemeral`, run one job, deregister, exit.

**Pinning policy:** Pin to a specific tag *and* digest, not `:latest`. The base runs with our PAT-derived registration token in env — supply-chain compromise of the upstream tag would be high-impact. Refresh on a schedule.

`infra/runner/Dockerfile`:
```dockerfile
# Pinned to an immutable tag + digest. Bump in tandem on a documented schedule.
# See infra/README.md "Bumping the runner base image".
FROM myoung34/github-runner:2.321.0@sha256:REPLACE_ME_WITH_DIGEST

# Build-time only — RUN steps need root to apt-install. Image returns to
# the base's default user (uid 1000 `runner`) at the end so the runner
# agent (and every job step) executes as non-root.
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git unzip jq \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends \
      nodejs xvfb \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libwayland-client0 libdbus-1-3 libdrm2 \
    && rm -rf /var/lib/apt/lists/*

# Pin pnpm at image build time. Run as runner so corepack writes shims
# under that user's $HOME and the cache dirs we'll mount end up in the
# right XDG locations.
USER runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV PNPM_STORE_DIR=/cache/pnpm-store
ENV PLAYWRIGHT_BROWSERS_PATH=/cache/playwright
```

**Verify env-var contract before shipping.** The exact env names below MUST be checked against the pinned `myoung34/github-runner` version's README. Some upstream releases use `RUNNER_LABELS` instead of `LABELS`, `DISABLE_AUTOUPDATE` instead of `DISABLE_AUTO_UPDATE`, etc. Phase 2 acceptance: a one-shot `podman run` of the image registers a runner with the expected labels visible in `gh api /repos/xau/hnch/actions/runners | jq '.runners[].labels'`.

Runtime config (passed by supervisor as env vars):
- `RUNNER_NAME` — unique per spawn.
- `RUNNER_SCOPE=repo`, `REPO_URL=https://github.com/xau/hnch`.
- `LABELS=self-hosted,linux,arm64,hnch-podman` (or `RUNNER_LABELS=…` per upstream contract).
- `EPHEMERAL=true` (or `1` per upstream contract).
- `DISABLE_AUTO_UPDATE=true` (or `DISABLE_AUTOUPDATE=true`).
- **`RUNNER_TOKEN=<short-lived-1h-registration-token>`** — fetched on host by supervisor, NOT the PAT. Keeps PAT off `/proc/self/environ` inside the container.

No custom `entrypoint.sh` needed — deleted from "Critical files".

Build inside the Podman machine:
```sh
podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/
```

**Smoke test before continuing:** confirm `git`, `node`, `pnpm`, `jq` are all in PATH inside the container (Dockerfile install line above adds these — required for `actions/checkout@v4` with `fetch-depth: 0`):
```sh
podman run --rm --userns=keep-id hnch-runner:latest \
  bash -c 'which git node pnpm jq && node --version && pnpm --version'
```

Build inside the Podman machine:
```sh
podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/
```

### Phase 3 — Supervisor with crashloop protection

`infra/runner/supervisor.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
: "${GH_REPO:?}"
: "${GH_REGISTRATION_PAT:?}"
: "${POOL_SIZE:=4}"

STATE_DIR="${HOME}/runner-cache/state"
mkdir -p "${STATE_DIR}"
SPAWN_LOG="${STATE_DIR}/spawns.log"
HEALTH_FILE="${HOME}/runner-cache/UNHEALTHY"

cleanup() { podman ps -q --filter "name=hnch-runner-" | xargs -r podman rm -f; }
trap cleanup EXIT

# Fetch a short-lived (1-hour) registration token via the PAT.
# Stays on the host — never passed to a container as the PAT itself.
fetch_registration_token() {
  curl -fsSL -X POST \
    -H "Authorization: token ${GH_REGISTRATION_PAT}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GH_REPO}/actions/runners/registration-token" \
    | jq -er .token
}

# `flock` serializes spawn-log access against any future concurrent runs.
log_spawn_attempt() {
  local name=$1
  ( flock 9; echo "$(date +%s) ${name}" >> "${SPAWN_LOG}" ) 9>"${SPAWN_LOG}.lock"
}

# Returns 0 if pool is healthy enough to spawn; 1 if we are crashlooping.
backoff_check() {
  local now recent
  now=$(date +%s)
  ( flock 9
    awk -v cutoff=$((now - 60)) '$1 >= cutoff' "${SPAWN_LOG}" 2>/dev/null \
      > "${SPAWN_LOG}.tmp" || true
    mv -f "${SPAWN_LOG}.tmp" "${SPAWN_LOG}" 2>/dev/null || touch "${SPAWN_LOG}"
  ) 9>"${SPAWN_LOG}.lock"
  recent=$(wc -l < "${SPAWN_LOG}" | tr -d ' ' 2>/dev/null || echo 0)
  if (( recent > 6 )); then
    if [[ ! -f "${HEALTH_FILE}" ]]; then
      touch "${HEALTH_FILE}"
      osascript -e 'display notification "hnch runner crashloop detected" with title "GH Runner"' \
        || true
    fi
    echo "[$(date)] CRASHLOOP (${recent} spawns/60s) — sleeping 5m" >&2
    sleep 300
    return 1
  fi
  return 0
}

# Confirm a spawned container reached the GH "online" state before clearing
# the UNHEALTHY marker. Avoids the "false-recovery" oscillation where a high
# crash rate naturally drops below the threshold during the 5-min sleep.
mark_healthy_if_runner_online() {
  local online
  online=$(curl -fsSL \
    -H "Authorization: token ${GH_REGISTRATION_PAT}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GH_REPO}/actions/runners" \
    | jq -r '[.runners[] | select(.status=="online" and (.labels | map(.name) | contains(["hnch-podman"])))] | length' \
    || echo 0)
  if (( online > 0 )); then rm -f "${HEALTH_FILE}"; fi
}

spawn_runner() {
  local idx=$1
  local NAME="hnch-runner-${idx}-$(date +%s)"
  local TOKEN
  TOKEN=$(fetch_registration_token) || { log_spawn_attempt "${NAME}-FAILED-TOKEN"; return 1; }
  log_spawn_attempt "${NAME}"
  podman run --rm -d \
    --name "${NAME}" \
    --platform linux/arm64 \
    --userns=keep-id \
    --env "RUNNER_NAME=${NAME}" \
    --env "RUNNER_SCOPE=repo" \
    --env "REPO_URL=https://github.com/${GH_REPO}" \
    --env "LABELS=self-hosted,linux,arm64,hnch-podman" \
    --env "EPHEMERAL=true" \
    --env "DISABLE_AUTO_UPDATE=true" \
    --env "RUNNER_TOKEN=${TOKEN}" \
    -v "${HOME}/runner-cache/pnpm-store-${idx}:/cache/pnpm-store" \
    -v "${HOME}/runner-cache/playwright:/cache/playwright" \
    -v "${HOME}/runner-cache/work-${idx}:/actions-runner/_work" \
    hnch-runner:latest
}

while true; do
  backoff_check || continue
  for i in $(seq 1 "${POOL_SIZE}"); do
    if ! podman ps -q --filter "name=hnch-runner-${i}-" | grep -q .; then
      spawn_runner "${i}" || true
    fi
  done
  mark_healthy_if_runner_online
  sleep 5
done
```

**Note on the `_work` bind mount:** the runner's checkout dir lives on the same filesystem as `/cache/pnpm-store` (both bind-mounted from `~/runner-cache/`). This lets pnpm hardlink from the store into `node_modules` instead of falling back to copy when the workdir is on overlayfs. Phase 1 step 2 must add `mkdir -p ~/runner-cache/work-{1..4}`.

**Disambiguation (post-worktree-tooling):** `~/runner-cache/work-${idx}` is the **runner agent's** workdir, not a git worktree. It exists to keep the checkout on the same filesystem as `pnpm-store-${idx}` (hardlink optimization, not branch isolation). Each ephemeral container starts with this dir empty; `actions/checkout@v4` populates it fresh per job. Host-side parallel git worktrees (`scripts/worktree-*`) are dev-only and never enter the container — `.env.local` is gitignored, `with-env.sh` is not on the CI path, and `global-setup.ts` skips when `CI=true`.

`infra/runner/dev.hnch.runner.plist` (LaunchAgent — runs as user `xau`, supervisor stays on host, runners live inside containers):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.hnch.runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/xau/Documents/projects/hnch/infra/runner/supervisor.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>GH_REPO</key><string>xau/hnch</string>
    <key>POOL_SIZE</key><string>4</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/Users/xau/Library/Logs/hnch-runner.out.log</string>
  <key>StandardErrorPath</key><string>/Users/xau/Library/Logs/hnch-runner.err.log</string>
</dict>
</plist>
```

PAT handling (out-of-tree, never committed):
- Issue **fine-grained PAT** scoped to `xau/hnch` only, permission `actions:write` (NOT classic `repo` scope — that grants push-to-main).
- Store in macOS Keychain: `security add-generic-password -s hnch-runner-pat -a xau -w '<pat>'`.
- Inject into LaunchAgent env at load time:
  ```sh
  launchctl setenv GH_REGISTRATION_PAT "$(security find-generic-password -s hnch-runner-pat -w)"
  launchctl load ~/Library/LaunchAgents/dev.hnch.runner.plist
  ```
- PAT lives only in supervisor process env on host — never in containers, never in workflow context.

### Phase 4 — GitHub repo settings + secrets hardening

1. **Settings → Actions → General**:
   - Default workflow permissions → "Read repository contents and packages permissions" (most restrictive).
   - "Fork pull request workflows from outside collaborators" → "Require approval for all outside collaborators" (defense-in-depth on a private repo).
2. **Settings → Variables → Actions** → create `LINUX_RUNNER` repo variable, default value `ubuntu-latest`. Workflows will reference `${{ vars.LINUX_RUNNER }}`. Flip to `[self-hosted, linux, arm64, hnch-podman]` once runner pool is healthy.
3. **Settings → Actions → Runners** → confirm 4 runners register w/ label `hnch-podman`, status "Idle".
4. **Top of `ci.yml`** (workflow-level), add:
   ```yaml
   permissions:
     contents: read
   ```
   Override per-job where needed (`pr-title-lint` already has `pull-requests: read`).

### Phase 5 — Migrate `verify` matrix

In `.github/workflows/ci.yml`, `verify` job:

- `runs-on: ubuntu-latest` → `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}`
  - `vars.LINUX_RUNNER` value: `["self-hosted","linux","arm64","hnch-podman"]` for self-hosted, or `["ubuntu-latest"]` for fallback. `fromJSON` lets one variable hold either form. The `|| '["ubuntu-latest"]'` guard ensures workflows still parse when the variable is unset (initial deploy, accidental delete, fresh fork).
- Add `if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository` — deny-list inversion: only blocks fork PRs from hitting self-hosted, allows `push`, `workflow_dispatch`, `merge_group`, `schedule` through (defense in depth).
- Add `timeout-minutes: 20`.
- **Drop `actions/setup-node@v4` entirely** — Node 22 is baked into `node:22-bookworm`.
- **Drop `corepack enable`** step — pre-baked in image.
- Keep `actions/checkout@v4`, `pnpm install --frozen-lockfile`, typecheck/lint/test/build sequence.
- Drop `cache: pnpm` since it's persistent volume now.
- Add at top of job:
  ```yaml
  - name: Runner identity
    run: |
      echo "Runner: $RUNNER_NAME on $(hostname) — arch $(uname -m)"
      df -h /cache || true
  ```

Note on `runs-on` toggle: when value is the JSON-string label list, `runs-on: ${{ fromJSON(vars.LINUX_RUNNER) }}` works for both shapes. **Existing workflow-level concurrency block** (`group: ci-${{ github.ref }}`) — keep it; remove plan-critic's earlier suggestion of layering a second one. Per-job concurrency goes inside affected jobs only.

### Phase 6 — Migrate `e2e` job

In `.github/workflows/ci.yml`, `e2e` job:

- `runs-on: ubuntu-latest` → `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}`
- `if:` guard same as verify (deny-list inversion).
- `timeout-minutes: 30`.
- Drop `actions/setup-node@v4`, `actions/cache@v4` for Playwright, `corepack enable`.
- Replace `playwright install --with-deps chromium` → `playwright install chromium` (system deps baked into image).
- Keep `actions/upload-artifact@v4` for Playwright report on failure.
- Add per-job concurrency:
  ```yaml
  concurrency:
    group: e2e-${{ github.ref }}
    cancel-in-progress: true
  ```

### Phase 7 — Policy guardrails

- **Per-job concurrency** (added in Phase 5/6 above):
  - `verify`: `group: verify-${{ github.ref }}-${{ matrix.package }}` (lives inside the matrix-expanded job, so `matrix.package` resolves correctly).
  - `e2e`: `group: e2e-${{ github.ref }}`.
- **Existing workflow-level** `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` — keep as-is. Outer block + inner block compose cleanly (inner is a stricter cancellation scope per job).
- **Timeouts on every self-hosted job** (`timeout-minutes`). Already added.
- **Supply-chain hardening:** consider `pnpm install --ignore-scripts` for verify jobs that only need build artifacts. Defer until first time it actually saves us — not essential v1.
- **Disk eviction** (weekly LaunchAgent):
  - Schedule: Sunday 04:00 local (`StartCalendarInterval: { Weekday: 0, Hour: 4, Minute: 0 }`).
  - **Active-job guard:** prune script first checks `podman ps -q --filter name=hnch-runner-` and exits early if any container is running. Avoids racing `pnpm store prune` against in-progress `pnpm install`.
  - `pnpm store prune` per store dir (4 stores).
  - `podman image prune -f --filter until=168h`.
  - Truncate `~/Library/Logs/hnch-runner.{out,err}.log` if >100 MB.
  - Disk-low alarm: `df -g ~/runner-cache | awk 'NR==2 && $4+0 < 30 { exit 1 }'` → `osascript` notification. Threshold 30 GB (Podman machine is 80 GB; we want headroom for in-flight builds + Tart later).
  - File: `infra/runner/dev.hnch.runner-prune.plist`.
- **Health-check workflow** on `ubuntu-latest`, `cron: '0 * * * *'` (hourly, ≈24 min/mo billable — was previously 15-min @ ~720 min/mo, which would have undermined the billing-budget goal):
  ```yaml
  - run: |
      online=$(gh api /repos/xau/hnch/actions/runners --jq '[.runners[] | select(.status=="online" and (.labels | map(.name) | contains(["hnch-podman"])))] | length')
      [ "$online" -ge 1 ] || { echo "::error::No hnch-podman runners online"; exit 1; }
  ```
  Failure → GitHub email notification. File: `.github/workflows/runner-health.yml`. (Hourly cron has GH's documented "scheduled workflows pause after 60 days of repo inactivity" rule — fine for an active repo.)

### Phase 8 — Documentation

`infra/README.md` — new section "Self-hosted runner pool":
- Architecture: GH → 4 ephemeral arm64 Podman containers on M4 → fresh per job.
- **Primary-worktree anchoring:** the LaunchAgent plist hardcodes the supervisor path under the primary repo (`/Users/xau/Documents/projects/hnch/`). Linked worktrees (`../hnch-<name>`) are dev-only and irrelevant to the runner — branch checkouts there do not move the binary the LaunchAgent loads. If the primary repo path ever moves, re-render and reload the plist.
- Start/stop: `launchctl {load,unload} ~/Library/LaunchAgents/dev.hnch.runner.plist`.
- **Disabling the pool (rollback):** `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'` — flips workflows to GH-hosted instantly, no PR required.
- Re-enable: `gh variable set LINUX_RUNNER --body '["self-hosted","linux","arm64","hnch-podman"]'`.
- Rotating PAT: `security add-generic-password -U …` then `launchctl unload && setenv && load`.
- Bumping runner version: edit Dockerfile `RUNNER_VERSION` arg, `podman build`, `launchctl kickstart -k gui/$(id -u)/dev.hnch.runner` (forces fresh containers on next spawn cycle).
- Logs: `~/Library/Logs/hnch-runner.{out,err}.log` + `podman logs <name>`.
- Cache poisoning runbook: nuke `~/runner-cache/pnpm-store-*` + `~/runner-cache/playwright`, supervisor reseeds on next spawn.
- Pre-Phase-9 RAM gate methodology (5-line cron sample, not "wing it"):
  ```sh
  # Add to crontab: every minute, log committed memory in MB
  * * * * * vm_stat | awk '/Pages active/{a=$3+0}/Pages wired/{w=$4+0} END {printf "%d %d\n", systime(), (a+w)*4/1024}' >> ~/ram.log
  # After 4 days:
  awk 'NR==1{n=NR}{p[NR]=$2} END {n=asort(p); print "p95 MB =", p[int(n*0.95)]}' ~/ram.log
  ```
  If p95 > 10 240 MB (10 GB), plan M4 RAM upgrade *before* Tart lands (M4 RAM not field-upgradable — order-time decision).

### Phase 9 (deferred — Phase 6b iOS) — Tart + Orchard for macOS runner

Not implemented now. Path forward documented for future-self:

1. Validate RAM gate (above).
2. `brew install cirruslabs/cli/tart cirruslabs/cli/orchard`.
3. Pull base image: `tart pull ghcr.io/cirruslabs/macos-sequoia-xcode:latest`.
4. Run **Orchard** as the Tart orchestrator — replaces a hand-rolled supervisor on the Mac side. Orchard offers a REST API, snapshot-revert per job, and existing GH Actions integration. AGPL license is fine for personal use.
5. Add `.github/workflows/ios-build.yml` w/ `runs-on: [self-hosted, macos, arm64, hnch-tart]`.
6. Limit to 1 concurrent Tart VM (RAM, not Apple license, is binding constraint at 16 GB).
7. Document iOS-during-release contention scenario: if iOS build coincides w/ verify burst, swap pressure on 16 GB. Mitigation: 24/32 GB RAM on next mini, OR gate iOS workflow behind `workflow_dispatch` only.

## Critical files

- `infra/runner/Dockerfile` (new) — extends `myoung34/github-runner` (pinned `:2.321.0@sha256:…`) w/ Node 22 + Playwright deps + pnpm + git/jq/unzip.
- `infra/runner/supervisor.sh` (new) — pool maintenance, host-side token fetch, crashloop backoff w/ `flock`-protected log + GH-API-confirmed health.
- `adr/00XX-self-hosted-runner.md` (new) — captures the architectural decision per CLAUDE.md ADR requirement (Podman + deferred Tart on M4 is a stack/structural change).
- `infra/runner/dev.hnch.runner.plist` (new) — LaunchAgent for supervisor.
- `infra/runner/dev.hnch.runner-prune.plist` (new) — weekly cache eviction.
- `infra/README.md` — new section + rollback runbook.
- `.github/workflows/ci.yml` — `runs-on` toggle on `verify` (~line 88) and `e2e` (~line 182), drop `setup-node`/`corepack enable`, add `if:` guards, add `timeout-minutes`, add workflow-level `permissions: contents: read`.
- `.github/workflows/runner-health.yml` (new) — every-15-min runner health check.

## Verification

1. **Cold boot:** `launchctl load`. Within ~30 s, `gh api /repos/xau/hnch/actions/runners | jq '.runners[].labels'` shows 4 idle runners labelled `hnch-podman`.
2. **Crashloop test:** unset PAT, kick supervisor — confirm it backs off after 6 failed spawns/60s, writes `~/runner-cache/UNHEALTHY`, fires macOS notification. Restore PAT, confirm recovery.
3. **Verify migration:** PR touching `packages/shared/src/`. `gh variable set LINUX_RUNNER --body '["self-hosted","linux","arm64","hnch-podman"]'`. `verify (shared)` runs in fresh container, completes in less wall-clock than latest ubuntu-latest run on `main`. `podman ps -a` after job → empty.
4. **E2e migration:** PR touching `packages/client/src/`. `e2e` runs on `hnch-podman`, Playwright browsers reused (no install output), green, report uploads on failure.
5. **Full-pipeline walltime + memory pressure:** PR touching `pnpm-lock.yaml` (forces `root=true` → all 4 verify lanes + e2e). Compare walltime vs last 3 main-branch runs of same shape; acceptable threshold ≤1.3× ubuntu-latest. **During the run**, capture `memory_pressure -l warn` and `vm_stat` samples — if compressor + swap exceed 8 GB on a 16 GB box, drop `POOL_SIZE` to 2 or `--memory 6144` on the Podman machine.

5a. **Hardlink speedup:** time `pnpm install` on first cold run vs second warm run on the same runner index. Warm should be substantially faster (cache hits → hardlinks). If walltime is identical, `_work` and pnpm store ended up on different filesystems and pnpm fell back to copy — investigate.
6. **Bleed test:** `export FOO=leaked && touch /tmp/leak` in one job; next job confirms `$FOO` unset and `/tmp/leak` absent.
7. **Concurrent install safety:** kick 4 PRs simultaneously, confirm 4 lanes run in parallel without `pnpm install` errors (per-runner stores).
8. **Rollback:** `gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'`. Push trivial commit. Confirm `verify` runs on `ubuntu-latest` w/o code change.
9. **Health check:** stop supervisor (`launchctl unload`). Within 15 min, scheduled `runner-health.yml` fires and emails about offline runners.
10. **Disk eviction:** trigger prune LaunchAgent manually (`launchctl start dev.hnch.runner-prune`); confirm pnpm store size drops, log files truncated.
11. **Billing check:** after 1 month, `gh api /user/settings/billing/actions` → minute usage drops to deploy/release jobs only (~100–200 min/month expected).

## Out of scope

- **Tart / iOS runner** — deferred to Phase 9 / Phase 6b.
- **Backup runner host** — not until CI uptime is mission-critical.
- **Auto-scaling** via `actions-runner-controller` or `orchard` — overkill for 4 static ephemeral runners.
- **Cross-arch x64 fallback** — if a native dep ever fails on arm64, document `--platform linux/amd64` workaround at that point.
- **Org-scoped runner sharing** — runners stay repo-scoped.

## Plan-critic pass 2 — additional resolutions

- **P2-C1 PAT-into-container regression (blocker):** resolved → supervisor pre-fetches a 1-hour `RUNNER_TOKEN` on host via PAT, passes only the short-lived token to the container. PAT never reaches `/proc/self/environ` inside any container.
- **P2-C2 macOS Podman UID handwave (high):** resolved → Phase 1 step 5 adds an empirical UID-mapping smoke test. If `--userns=keep-id` doesn't behave as expected on this Podman version, the test fails fast with a documented fallback path.
- **P2-C4 myoung34 env-var contract (high):** resolved → pinned `myoung34/github-runner:2.321.0@sha256:…`, env-var spelling explicitly flagged for verification before shipping (`LABELS` vs `RUNNER_LABELS`, `EPHEMERAL` value form, etc.).
- **P2-C5 :latest tag risk (high):** resolved → digest-pinned base image, runbook entry for refresh cadence in Phase 8.
- **P2-C6 unset `vars.LINUX_RUNNER` failure (high):** resolved → `fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]')` guards against missing/deleted variable.
- **P2-C7 fork-PR guard misses other event types (medium):** resolved → inverted to deny-list (`event_name != 'pull_request' || head_repo == repository`).
- **P2-C8 health-check minute spend (medium):** resolved → cron dropped from `*/15` to `0 * * * *` (~24 min/mo, 30× cheaper).
- **P2-C9 SPAWN_LOG race (medium):** resolved → `flock` around log read + write paths.
- **P2-C10 UNHEALTHY marker oscillation (medium):** resolved → marker cleared only when `gh api` confirms a runner is `online` with the expected label; not by spawn-rate dropping under threshold.
- **P2-C11 git in base image (medium):** resolved → Dockerfile installs `git unzip jq` explicitly + smoke test.
- **P2-C12 prune schedule + active-job guard (low):** resolved → Sunday 04:00 schedule + guard `podman ps` empty before pruning.
- **P2-C13 RAM budget realism (medium):** resolved → verification step 5 captures `memory_pressure` + `vm_stat` during full-pipeline run; documented downscale paths if pressure > 8 GB.
- **P2-C14 p95 RAM measurement methodology (low):** resolved → 5-line cron + awk percentile script in Phase 8.
- **P2-C15 hardlink fallback across filesystems (medium):** resolved → bind-mount `_work-${idx}` from same host parent as pnpm store; verification step 5a times cold-vs-warm install to confirm hardlinks.
- **P2-C16 missing ADR (low):** resolved → Phase 8 + critical-files list now include `adr/00XX-self-hosted-runner.md` (ADR delegated to `adr-writer` subagent during implementation, per CLAUDE.md).

## Plan-critic pass 1 — resolutions

- **C1 arm64/x64 mismatch (blocker):** resolved → arm64 native runner agent + label.
- **C2 supervisor crashloop (high):** resolved → spawn-rate backoff + LaunchAgent ThrottleInterval + UNHEALTHY marker + macOS notification.
- **C3 secrets-in-container (high):** resolved → workflow-level `permissions: contents: read`, fork-PR `if:` guard, fine-grained PAT.
- **C4 concurrency expression (high):** resolved → per-job concurrency, keep workflow-level outer block as-is, `matrix.package` only used inside `verify`.
- **C5 mount path / user mismatch (high):** resolved differently than critic suggested — kept container non-root (`runner` uid 1000 from `myoung34/github-runner`), added `--userns=keep-id` for clean host↔container UID mapping, explicit `PNPM_STORE_DIR` and `PLAYWRIGHT_BROWSERS_PATH`. Per user preference: rootless top-to-bottom.
- **C6 shared store races (medium):** resolved → per-runner pnpm store dirs.
- **C7 parallelism throttle (medium):** resolved → POOL_SIZE=4 (matches verify matrix); full-pipeline walltime added to verification.
- **C8 disk eviction (medium):** resolved → weekly LaunchAgent + disk-low alarm + log truncation.
- **C9 cache poisoning (medium):** resolved → wipe-and-reseed runbook in `infra/README.md`; `--ignore-scripts` flagged as future hardening. (Note: `_work-${idx}` bind mount was *re-introduced* in pass 2 C15 for hardlink-across-filesystems reasons — not the same as the unused generic `workdir/` from pass 1.)
- **C10 corepack/playwright sudo (medium):** resolved → corepack baked into Dockerfile, `playwright install` w/o `--with-deps`, system deps pre-baked.
- **C11 rollback (low):** resolved → `vars.LINUX_RUNNER` repo variable for one-line fallback.
- **C12 observability (low):** resolved → 15-min scheduled health-check workflow on ubuntu-latest.
- **C13 Tart RAM headroom (low):** resolved → explicit pre-Phase-9 RAM measurement gate, M4 non-upgradable RAM caveat documented.
- **C14 setup-node redundancy (low):** resolved → drop `actions/setup-node@v4` and `corepack enable` from self-hosted jobs; Node + pnpm baked into image.
