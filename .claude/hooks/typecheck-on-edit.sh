#!/usr/bin/env bash
# PostToolUse hook for Edit/Write/MultiEdit: typecheck the affected package.
# Debounced: skips if same package was checked <30s ago in this shell-state file.
# Exit 2 = surface stderr back to Claude. Exit 0 = silent success.

set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

[ -z "$file" ] && exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$file" in
  "$REPO"/packages/cli/src/*.ts|"$REPO"/packages/cli/src/*.tsx)   pkg=cli ;;
  "$REPO"/packages/relay/src/*.ts)                                 pkg=relay ;;
  "$REPO"/packages/shared/src/*.ts)                                pkg=shared ;;
  *) exit 0 ;;
esac

# debounce: skip if last check for this pkg was within 30s
state_dir="$REPO/.claude/.state"
mkdir -p "$state_dir" 2>/dev/null
stamp_file="$state_dir/typecheck-$pkg.stamp"
now=$(date +%s)
if [ -f "$stamp_file" ]; then
  last=$(cat "$stamp_file" 2>/dev/null || echo 0)
  if [ $(( now - last )) -lt 30 ]; then exit 0; fi
fi
echo "$now" > "$stamp_file"

cd "$REPO" || exit 0
out=$(pnpm --filter "./packages/$pkg" --silent typecheck 2>&1)
ec=$?

if [ $ec -ne 0 ]; then
  printf 'typecheck failed for packages/%s after editing %s\n' "$pkg" "$(basename "$file")" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi

exit 0
