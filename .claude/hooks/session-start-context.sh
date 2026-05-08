#!/usr/bin/env bash
# SessionStart hook: inject repo state (branch, ahead/behind, dirty files) into context.

set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$REPO" 2>/dev/null || exit 0

branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo "?")

ab=$(git rev-list --left-right --count "origin/main...HEAD" 2>/dev/null || echo "0	0")
behind=$(printf '%s' "$ab" | awk '{print $1}')
ahead=$(printf '%s' "$ab" | awk '{print $2}')

dirty=$(git status --short 2>/dev/null)
dirty_count=$(printf '%s' "$dirty" | grep -c . || true)

last_commit=$(git log -1 --format='%h %s' 2>/dev/null || echo "(no commits)")

ctx="## Repo state
- Branch: \`$branch\` (ahead $ahead / behind $behind vs origin/main)
- Last commit: $last_commit
- Working tree: $dirty_count modified file(s)"

if [ "$dirty_count" -gt 0 ] && [ "$dirty_count" -le 15 ]; then
  ctx="$ctx

\`\`\`
$dirty
\`\`\`"
fi

jq -n --arg c "$ctx" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
