#!/usr/bin/env bash
# PostToolUse hook for Edit/Write/MultiEdit: auto-format the edited file with Biome.
# Silent on success; non-zero biome exit is swallowed (formatter must not block edits).

set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# only format files inside repo
case "$file" in
  "$REPO"/*) ;;
  *) exit 0 ;;
esac

# skip files Biome doesn't handle
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc) ;;
  *) exit 0 ;;
esac

# skip generated / vendored paths
case "$file" in
  *"/node_modules/"*|*"/dist/"*|*"/.angular/"*|*"/coverage/"*|*"/playwright-report/"*|*"/test-results/"*) exit 0 ;;
esac

cd "$REPO" || exit 0
pnpm exec biome format --write "$file" >/dev/null 2>&1 || true

exit 0
