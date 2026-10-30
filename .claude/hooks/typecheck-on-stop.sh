#!/usr/bin/env bash
# Stop hook: run the root `pnpm typecheck` once per turn when TypeScript under
# packages/ changed, so a shared edit that breaks a cli/relay/client consumer is
# caught before the turn ends.
#
# "Changed" = the fingerprint of every tracked or untracked (not ignored)
# *.ts/*.tsx/*.mts/*.cts and tsconfig*.json under packages/ (path + content hash)
# differs from the one recorded after the last run. The stamp lives in this
# worktree's git dir and is written only after typecheck has finished.
#
# On failure: exit 2 with the errors on stderr, which Claude Code feeds back so
# the turn continues. The stamp also records failing states, so a continuation
# that changes nothing is not blocked again (the stop_hook_active loop guard
# falls out of this); the next TS change re-runs the check.

set -uo pipefail

input=$(cat)
cwd=$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)

# Prefer the checkout Claude is working in (a worktree), else the project dir.
root=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$root" ] || [ ! -f "$root/.claude/hooks/typecheck-on-stop.sh" ]; then
  root="${CLAUDE_PROJECT_DIR:-}"
fi
[ -n "$root" ] && [ -d "$root/packages" ] || exit 0
# Not bootstrapped yet (no pnpm install): nothing meaningful to check.
[ -d "$root/node_modules" ] || exit 0
cd "$root" || exit 0

stamp=$(git rev-parse --git-path claude-typecheck.stamp 2>/dev/null) || exit 0

fingerprint() {
  local paths
  # -c also lists tracked files deleted from the worktree; keep only existing ones.
  paths=$(git ls-files -co --exclude-standard -- \
    'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.mts' 'packages/**/*.cts' \
    'packages/**/tsconfig*.json' |
    sort -u |
    while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done)
  [ -n "$paths" ] || return 1
  paste <(printf '%s\n' "$paths") <(printf '%s\n' "$paths" | git hash-object --stdin-paths) |
    git hash-object --stdin
}

fp=$(fingerprint) || exit 0
[ -n "$fp" ] || exit 0
[ "$fp" = "$(cat "$stamp" 2>/dev/null)" ] && exit 0

# The root `pnpm typecheck` (pretypecheck builds shared, then every package),
# spelled out with --no-bail: the root script stops at the first failing package,
# which would hide a cli/relay error behind a client one.
out=$(pnpm run pretypecheck 2>&1 && pnpm -r --no-bail --if-present run typecheck 2>&1)
ec=$?
printf '%s\n' "$fp" > "$stamp"

[ "$ec" -eq 0 ] && exit 0

{
  printf 'pnpm typecheck failed after TypeScript changes under packages/. Fix these before finishing:\n'
  errors=$(printf '%s\n' "$out" | grep -E 'error TS[0-9]+' | head -40)
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors"
  else
    printf '%s\n' "$out" | tail -40
  fi
} >&2
exit 2
