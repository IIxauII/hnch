#!/usr/bin/env bash
# Install the hnch self-hosted runner LaunchAgents on macOS.
#
# Why this script exists: macOS TCC blocks launchd from executing scripts under
# ~/Documents (and other protected locations). The plists therefore reference
# ~/.local/bin, which is not TCC-restricted. This script copies the supervisor
# and prune scripts there, and installs the plists.
#
# Idempotent. Re-run safe.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_DIR="${REPO_DIR}/infra/runner"
BIN_DIR="${HOME}/.local/bin"
LA_DIR="${HOME}/Library/LaunchAgents"

mkdir -p "${BIN_DIR}" "${LA_DIR}"

install -m 755 "${SRC_DIR}/supervisor.sh" "${BIN_DIR}/hnch-runner-supervisor.sh"
install -m 755 "${SRC_DIR}/prune.sh"      "${BIN_DIR}/hnch-runner-prune.sh"
install -m 644 "${SRC_DIR}/dev.hnch.runner.plist"       "${LA_DIR}/"
install -m 644 "${SRC_DIR}/dev.hnch.runner-prune.plist" "${LA_DIR}/"

echo "Installed:"
echo "  ${BIN_DIR}/hnch-runner-supervisor.sh"
echo "  ${BIN_DIR}/hnch-runner-prune.sh"
echo "  ${LA_DIR}/dev.hnch.runner.plist"
echo "  ${LA_DIR}/dev.hnch.runner-prune.plist"
echo
echo "Next:"
echo "  # one-time: store PAT in Keychain (supervisor reads it from there)"
echo "  security add-generic-password -a \"\$USER\" -s hnch-runner-pat -w"
echo "  launchctl load ${LA_DIR}/dev.hnch.runner.plist"
echo "  launchctl load ${LA_DIR}/dev.hnch.runner-prune.plist"
