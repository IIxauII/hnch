#!/usr/bin/env bash
# PreToolUse hook for Bash: enforce Conventional Commits with a required scope on `git commit -m`.
# Project rule: commit type drives semantic-release; scope is required (CLAUDE.md / CONTRIBUTING.md).
# Best-effort parse of the -m subject; if it can't be parsed, the commit is allowed (no false blocks).
# Exit 2 = block tool call and surface stderr to Claude.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

# only inspect `git commit` with an inline -m message
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac
printf '%s' "$cmd" | grep -qE -- '-m([[:space:]]|=)' || exit 0

# extract the first -m subject (double- or single-quoted). Empty => can't parse => allow.
subject=$(printf '%s' "$cmd" | perl -ne '
  if (/-m(?:\s+|=)"((?:[^"\\]|\\.)*)"/)        { print $1; exit }
  elsif (/-m(?:\s+|=)'"'"'([^'"'"']*)'"'"'/)   { print $1; exit }
')
[ -z "$subject" ] && exit 0

# Conventional Commits with mandatory scope: type(scope)!?: description
# types per CONTRIBUTING.md; scope = lowercase pkg name(s), comma-separated allowed.
if printf '%s' "$subject" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\([a-z0-9,_/-]+\)!?: .+'; then
  exit 0
fi

printf 'blocked: commit subject must be Conventional Commits with a scope: `type(scope): description`.\n' >&2
printf 'got: %s\n' "$subject" >&2
printf 'types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert. Scope is required (CLAUDE.md / CONTRIBUTING.md).\n' >&2
exit 2
