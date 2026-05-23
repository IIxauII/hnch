#!/usr/bin/env bash
# PreToolUse hook for Bash: warn (and block) on `git push --force` / `-f` / `--force-with-lease`.
# Exit 2 surfaces to Claude so it must reconfirm intent; user can still re-run after acknowledging.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

# detect force flags: --force, --force-with-lease, or -f as a standalone arg
if printf '%s' "$cmd" | grep -qE -- '(--force(-with-lease)?|[[:space:]]-f([[:space:]]|$))'; then
  # extra-loud if target is main/master
  if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(origin[[:space:]]+)?(main|master)([[:space:]]|$)'; then
    printf 'BLOCKED: force push to main/master. Confirm with user via AskUserQuestion before retrying.\n' >&2
    exit 2
  fi
  printf 'WARN: force push detected. Confirm intent + branch with user before retrying. Cmd: %s\n' "$cmd" >&2
  exit 2
fi

exit 0
