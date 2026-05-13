#!/usr/bin/env bash
# Weekly cache eviction for the hnch self-hosted runner pool.
# Invoked by ~/Library/LaunchAgents/dev.hnch.runner-prune.plist on Sunday 04:00.
#
# Responsibilities:
#   0. Deregister stale offline runner records on GitHub. Safe alongside
#      running containers — only touches GH API. Runs before the active-job
#      guard so it executes every week regardless of pool state.
#   1. Active-job guard — abort if any hnch-runner-* container is running so we
#      don't race `pnpm store prune` against an in-progress `pnpm install`.
#   2. `pnpm store prune` against each per-runner store under ~/runner-cache.
#   3. `podman image prune -f --filter until=168h` — drop images unused >7d.
#   4. Truncate ~/Library/Logs/hnch-runner.{out,err}.log if >100 MB.
#   5. Disk-low alarm — fire a macOS notification if free space on
#      ~/runner-cache drops under 30 GB.
set -euo pipefail

LOG_DIR="${HOME}/Library/Logs"
CACHE_ROOT="${HOME}/runner-cache"
LOG_TRUNCATE_MB=100
DISK_LOW_THRESHOLD_GB=30
GH_REPO="${GH_REPO:-IIxauII/hnch}"

# 0. Deregister stale offline runner records on GitHub.
# Ghost records accumulate from supervisor restarts where the prior container
# died without `config.sh remove` — GH keeps the registration but no agent
# polls. They're cosmetic but clutter the runners list.
#
# Safety: filter on status=="offline" only. Active runners (and runners that
# are merely transient between jobs) are status=="online", so we never
# deregister something that is about to pick up work.
deregister_stale_runners() {
  local pat
  pat=$(security find-generic-password -a "${USER}" -s hnch-runner-pat -w 2>/dev/null) || {
    echo "[$(date)] PAT not in Keychain — skipping stale-runner cleanup" >&2
    return 0
  }
  local listing
  listing=$(curl -fsS -H "Authorization: token ${pat}" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GH_REPO}/actions/runners" 2>/dev/null) || {
    echo "[$(date)] failed listing runners — skipping stale-runner cleanup" >&2
    return 0
  }
  local ids
  ids=$(jq -r '.runners[] | select(.status=="offline") | .id' <<<"${listing}")
  local count=0 failed=0
  for id in ${ids}; do
    if curl -fsS -X DELETE -H "Authorization: token ${pat}" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${GH_REPO}/actions/runners/${id}" >/dev/null 2>&1; then
      count=$((count + 1))
    else
      failed=$((failed + 1))
    fi
  done
  echo "[$(date)] deregistered ${count} stale offline runner(s)$([ ${failed} -gt 0 ] && echo " (${failed} failed)")"
}
deregister_stale_runners

# 1. Active-job guard.
if podman ps -q --filter "name=hnch-runner-" | grep -q .; then
  echo "[$(date)] active hnch-runner-* container detected — skipping cache prune" >&2
  exit 0
fi

# 2. pnpm store prune per runner. Each runner has its own store to avoid
# concurrent-write races (see ADR / plan Phase 1).
for i in 1 2 3 4; do
  store_dir="${CACHE_ROOT}/pnpm-store-${i}"
  if [[ -d "${store_dir}" ]]; then
    echo "[$(date)] pruning ${store_dir}"
    PNPM_STORE_DIR="${store_dir}" pnpm store prune || \
      echo "[$(date)] pnpm store prune failed for ${store_dir}" >&2
  fi
done

# 2b. Prune node_modules snapshots — LRU by mtime, drop >14d.
# .github/actions/pnpm-install touches mtime on each hit, so cold entries decay
# naturally. Snapshots are ~200-400 MB each; keeping 2 weeks of churn bounds
# the dir without invalidating common-lockfile entries between feature waves.
SNAP_DIR="${CACHE_ROOT}/nm-snapshots"
if [[ -d "${SNAP_DIR}" ]]; then
  echo "[$(date)] pruning ${SNAP_DIR} (>14d mtime)"
  find "${SNAP_DIR}" -type f -name '*.tar.zst' -mtime +14 -print -delete || true
fi

# 3. Drop podman images unused for the past 7 days.
podman image prune -f --filter until=168h || true

# 4. Truncate supervisor logs if they exceed the threshold.
for log in "${LOG_DIR}/hnch-runner.out.log" "${LOG_DIR}/hnch-runner.err.log"; do
  if [[ -f "${log}" ]]; then
    size_mb=$(($(stat -f%z "${log}") / 1024 / 1024))
    if (( size_mb > LOG_TRUNCATE_MB )); then
      echo "[$(date)] truncating ${log} (${size_mb} MB > ${LOG_TRUNCATE_MB} MB)"
      : > "${log}"
    fi
  fi
done

# 5. Disk-low alarm. `df -g` reports sizes in GB on macOS.
free_gb=$(df -g "${CACHE_ROOT}" | awk 'NR==2 { print $4+0 }')
if (( free_gb < DISK_LOW_THRESHOLD_GB )); then
  osascript -e "display notification \"Free space on ~/runner-cache is ${free_gb} GB (<${DISK_LOW_THRESHOLD_GB} GB)\" with title \"GH Runner: disk low\"" || true
  echo "[$(date)] DISK LOW: ${free_gb} GB free on ${CACHE_ROOT}" >&2
fi

echo "[$(date)] prune complete"
