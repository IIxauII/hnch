#!/usr/bin/env bash
# Stop hook: native macOS notification when Claude finishes responding.

set -uo pipefail

cwd=$(basename "$(pwd)")
osascript -e "display notification \"finished in $cwd\" with title \"Claude Code\" sound name \"Pop\"" >/dev/null 2>&1 || true

exit 0
