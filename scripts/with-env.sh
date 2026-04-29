#!/usr/bin/env bash
# Source .env.local (if present) into environment, then exec command.
# Used by root package.json dev/test scripts so worktree-specific port
# offsets propagate to client/relay/cli/playwright invocations.

set -e

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

# Convention guard: client (packages/client/src/environments/environment.ts)
# derives relay port from window.location.port via:
#   RELAY_PORT = 1234 + (CLIENT_PORT - 4200)
# If .env.local sets a mismatched RELAY_PORT, the relay binds one port and
# the client tries to connect to a different one — silent failures.
if [ -n "${CLIENT_PORT:-}" ] && [ -n "${RELAY_PORT:-}" ]; then
  if ! [[ "$CLIENT_PORT" =~ ^[0-9]+$ ]] || ! [[ "$RELAY_PORT" =~ ^[0-9]+$ ]]; then
    echo "⚠ .env.local CLIENT_PORT/RELAY_PORT must be numeric — skipping convention guard." >&2
    exec "$@"
  fi
  expected=$((1234 + CLIENT_PORT - 4200))
  if [ "$RELAY_PORT" != "$expected" ]; then
    echo "⚠ .env.local convention violated: RELAY_PORT=$RELAY_PORT but CLIENT_PORT=$CLIENT_PORT expects RELAY_PORT=$expected" >&2
    echo "  Client derives relay port from window.location.port — mismatched ports → silent connection failures." >&2
    echo "  Run \`pnpm worktree:bootstrap\` to regenerate .env.local." >&2
  fi
fi

# Sanity check: warn if running in a linked worktree without .env.local.
# Detect linked worktree via git-dir != git-common-dir (CWD-independent).
if [ ! -f .env.local ] && command -v git >/dev/null 2>&1; then
  gd="$(git rev-parse --git-dir 2>/dev/null || true)"
  gcd="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$gd" ] && [ -n "$gcd" ] && [ "$gd" != "$gcd" ]; then
    echo "⚠ No .env.local in this worktree. Run \`pnpm worktree:bootstrap\` first." >&2
    echo "  (Continuing with default ports — may collide with main worktree.)" >&2
  fi
fi

exec "$@"
