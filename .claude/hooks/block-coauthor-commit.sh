#!/usr/bin/env bash
# PreToolUse hook for Bash: block `git commit` containing Co-Authored-By trailer.
# Per project + global preference: no Claude attribution in commit messages.
# Exit 2 = block tool call and surface stderr to Claude.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

# only inspect git commit invocations
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# case-insensitive match for Co-Authored-By trailer
if printf '%s' "$cmd" | grep -qiE 'co-authored-by'; then
  printf 'blocked: git commit contains Co-Authored-By trailer. Project policy forbids attribution trailers (CLAUDE.md). Remove it and retry.\n' >&2
  exit 2
fi

exit 0
