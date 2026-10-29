#!/usr/bin/env bash
set -euo pipefail
: "${GH_REPO:?}"
: "${POOL_SIZE:=2}"

# PAT lives in macOS Keychain (service: hnch-runner-pat, account: $USER).
# Avoids storing the secret in the plist (world-readable in user dir) or
# requiring `launchctl setenv` after every reboot.
GH_REGISTRATION_PAT="$(security find-generic-password -a "${USER}" -s hnch-runner-pat -w 2>/dev/null)" || {
  echo "[$(date)] FATAL: PAT not found in Keychain (service=hnch-runner-pat account=${USER})" >&2
  echo "  Add with: security add-generic-password -a \"\${USER}\" -s hnch-runner-pat -w" >&2
  sleep 60
  exit 1
}
export GH_REGISTRATION_PAT

# Slot 1 is the only runner registered with the `e2e` label (ADR-0052).
# Playwright jobs (`ci.yml` e2e, `screenshots-main.yml`) require that label, so
# at most one of them runs at a time and they never share the podman VM's
# CPUs. Two at once (4 Playwright workers + ng serve + wrangler each) ran every
# step 4-5x slower and pushed tests past their 45 s budget. Other jobs still
# land on slot 1. Slot 1 exists for every POOL_SIZE >= 1, and the label is
# re-applied on every ephemeral re-registration below.
readonly E2E_SLOT=1
readonly BASE_LABELS="self-hosted,linux,arm64,hnch-podman"

STATE_DIR="${HOME}/runner-cache/state"
mkdir -p "${STATE_DIR}"
SPAWN_LOG="${STATE_DIR}/spawns.log"
HEALTH_FILE="${HOME}/runner-cache/UNHEALTHY"

cleanup() { podman ps -q --filter "name=hnch-runner-" | xargs -r podman rm -f; }
trap cleanup TERM INT EXIT

# Self-heal on startup: prior supervisor may have died via SIGKILL (launchctl
# kickstart -k, OOM, panic) without running the EXIT trap, leaving orphaned
# containers. The slot-occupancy check below would then skip respawning them.
# Nuke any survivors before entering the main loop so every restart yields a
# fully fresh pool.
cleanup

# Fetch a short-lived (1-hour) registration token via the PAT.
# Stays on the host — never passed to a container as the PAT itself.
#
# Retries absorb transient macOS resolver hiccups (wake-from-sleep network
# re-attach, DHCP renew, mDNSResponder reloads). Without retry, a single
# brief DNS blackout fans out across all POOL_SIZE slots within one
# supervisor loop and trips the crashloop guard, stranding the pool for
# 5 minutes.
fetch_registration_token() {
  local attempt token
  for attempt in 1 2 3 4; do
    if token=$(curl -fsSL \
      --connect-timeout 5 --max-time 15 \
      --retry 2 --retry-connrefused --retry-delay 2 \
      -X POST \
      -H "Authorization: token ${GH_REGISTRATION_PAT}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${GH_REPO}/actions/runners/registration-token" \
      | jq -er .token 2>/dev/null); then
      printf '%s\n' "${token}"
      return 0
    fi
    echo "[$(date)] token fetch attempt ${attempt} failed — retrying" >&2
    sleep $((attempt * 2))
  done
  return 1
}

# mkdir-based advisory lock — portable to macOS (no flock in base install)
# and races safely if a second supervisor ever runs (mkdir is atomic).
acquire_lock() {
  local tries=0
  while ! mkdir "${SPAWN_LOG}.lock" 2>/dev/null; do
    sleep 0.1
    tries=$((tries + 1))
    if (( tries > 50 )); then
      echo "[$(date)] WARN: stale lock at ${SPAWN_LOG}.lock — forcing release" >&2
      # Force-release. Handle both regular file (legacy flock leftover) and dir.
      rm -rf "${SPAWN_LOG}.lock"
      tries=0
    fi
  done
}
release_lock() { rm -rf "${SPAWN_LOG}.lock"; }

# Logs a *failed* spawn attempt. Successful spawns are intentionally not
# logged: ephemeral runners exit after one job by design, so a healthy pool
# of size N draining a burst of N jobs in <60s would otherwise look identical
# to a crashloop. Only true failures (token fetch, `podman run`) count toward
# the backoff threshold.
log_spawn_failure() {
  local name=$1
  acquire_lock
  echo "$(date +%s) ${name}" >> "${SPAWN_LOG}"
  release_lock
}

# Returns 0 if pool is healthy enough to spawn; 1 if we are crashlooping.
# "Crashloop" = repeated *failed* spawns. Successful spawns that exit
# naturally (ephemeral runner finished a job) are not counted — see
# log_spawn_failure above.
backoff_check() {
  local now recent
  now=$(date +%s)
  acquire_lock
  awk -v cutoff=$((now - 60)) '$1 >= cutoff' "${SPAWN_LOG}" 2>/dev/null \
    > "${SPAWN_LOG}.tmp" || true
  mv -f "${SPAWN_LOG}.tmp" "${SPAWN_LOG}" 2>/dev/null || touch "${SPAWN_LOG}"
  release_lock
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
  local LABELS="${BASE_LABELS}"
  if (( idx == E2E_SLOT )); then LABELS="${LABELS},e2e"; fi
  local TOKEN
  TOKEN=$(fetch_registration_token) || { log_spawn_failure "${NAME}-FAILED-TOKEN"; return 1; }
  # Bump nofile from Podman's macOS default (~1024). Verify matrix + version-audit
  # under PR concurrency hit EMFILE during `pnpm install` (copy mode across split
  # bind mounts of /cache/pnpm-store and /actions-runner/_work).
  if ! podman run --rm -d \
    --name "${NAME}" \
    --platform linux/arm64 \
    --userns=keep-id \
    --ulimit nofile=65536:65536 \
    --env "RUNNER_NAME=${NAME}" \
    --env "REPO_URL=https://github.com/${GH_REPO}" \
    --env "LABELS=${LABELS}" \
    --env "RUNNER_TOKEN=${TOKEN}" \
    -v "${HOME}/runner-cache/pnpm-store-${idx}:/cache/pnpm-store" \
    -v "${HOME}/runner-cache/playwright:/cache/playwright" \
    -v "${HOME}/runner-cache/nm-snapshots:/cache/nm-snapshots" \
    -v "${HOME}/runner-cache/work-${idx}:/actions-runner/_work" \
    hnch-runner:latest >/dev/null; then
    log_spawn_failure "${NAME}-FAILED-PODMAN-RUN"
    return 1
  fi
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
