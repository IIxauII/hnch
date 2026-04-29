#!/usr/bin/env bash
# Ephemeral runner entrypoint. Registers with the repo, runs one job, exits.
# The supervisor on the host re-spawns the container after exit.
set -euo pipefail

: "${RUNNER_NAME:?RUNNER_NAME required}"
: "${REPO_URL:?REPO_URL required}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN required (1-hour registration token)}"
: "${LABELS:?LABELS required (comma-separated)}"

cd /home/runner

# Register. --ephemeral makes the runner deregister + exit after one job.
# --disableupdate prevents in-place updates that would race the digest pin.
./config.sh \
  --unattended \
  --url "${REPO_URL}" \
  --token "${RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${LABELS}" \
  --ephemeral \
  --disableupdate

# Run. exec so signals propagate and PID 1 is the runner agent.
exec ./run.sh
