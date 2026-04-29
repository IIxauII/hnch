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
