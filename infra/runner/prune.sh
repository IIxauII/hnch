#!/usr/bin/env bash
# Weekly cache eviction for the hnch self-hosted runner pool.
# Invoked by ~/Library/LaunchAgents/dev.hnch.runner-prune.plist on Sunday 04:00.
#
# Responsibilities (per plan-self-hosted-runner.md, Phase 7):
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

# 1. Active-job guard.
if podman ps -q --filter "name=hnch-runner-" | grep -q .; then
  echo "[$(date)] active hnch-runner-* container detected — skipping prune" >&2
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
