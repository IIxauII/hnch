#!/usr/bin/env bash
# PreToolUse hook for Bash: enforce pnpm as the package manager.
# Repo is a pnpm-workspaces monorepo (ADR-0014); npm/yarn installs corrupt the lockfile.
# Blocks `npm install|i|ci|add` and `yarn|yarn add|yarn install`. Leaves `npx` alone.
# Exit 2 = block tool call and surface stderr to Claude.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

# npm install / npm i / npm ci / npm add  (but NOT `npx`, `npm run`, `npm test`)
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])npm[[:space:]]+(install|i|ci|add)([[:space:]]|$)'; then
  printf 'blocked: use pnpm, not npm. This is a pnpm-workspaces monorepo (ADR-0014); npm corrupts the lockfile. Try `pnpm install` / `pnpm add`.\n' >&2
  exit 2
fi

# yarn (bare) / yarn add / yarn install
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])yarn([[:space:]]+(add|install|remove))?([[:space:]]|$)'; then
  printf 'blocked: use pnpm, not yarn. This is a pnpm-workspaces monorepo (ADR-0014). Try `pnpm install` / `pnpm add`.\n' >&2
  exit 2
fi

exit 0
