#!/usr/bin/env bash
# PreToolUse hook for Bash: enforce pnpm as the package manager.
# Repo is a pnpm-workspaces monorepo (ADR-0014); npm/yarn installs corrupt the lockfile.
# Blocks `npm install|i|ci|add` and any `yarn` invocation. Leaves `npx` alone.
# Exit 2 = block tool call and surface stderr to Claude.
#
# Structure-aware, like warn-force-push.sh: heredoc bodies and quoted strings are
# stripped before matching, and only a word in command position counts. So a
# `gh pr create --body "... npm install ..."`, a heredoc that writes that text to
# a file, or `grep yarn docs/` is not blocked.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

# Prints "npm" or "yarn" for the first offending invocation, nothing otherwise.
hit=$(printf '%s' "$cmd" | perl -0777 -ne '
  my $s = $_;
  # 1. Heredoc bodies: drop body + terminator line, keep the rest of the marker line.
  $s =~ s/(?<!<)<<-?[ \t]*([\x27"]?)([A-Za-z_][A-Za-z0-9_]*)\1([^\n]*)\n.*?^[ \t]*\2[ \t]*(?:\n|\z)/$3\n/msg;
  # 2. Quoted strings (single, or double with backslash escapes), left to right.
  #    A backslash escape outside quotes is kept so \" does not open a string.
  $s =~ s/\\.|\x27[^\x27]*\x27|"(?:[^"\\]|\\.)*"/substr($&, 0, 1) eq "\\" ? $& : " "/gse;
  # 3. Command position: line start or after ; & | ( ` $( , then optional
  #    keywords, wrappers and VAR=value assignments.
  my $start = qr/(?:^|[;&|(`])[ \t]*(?:(?:then|do|else|sudo|command|exec|env|time|nohup|xargs)[ \t]+|[A-Za-z_][A-Za-z0-9_]*=\S*[ \t]+)*/m;
  my $end = qr/(?=[ \t;&|)`]|$)/m;
  if    ($s =~ /${start}npm[ \t]+(?:install|i|ci|add)${end}/) { print "npm" }
  elsif ($s =~ /${start}yarn${end}/)                         { print "yarn" }
')

case "$hit" in
  npm)
    printf 'blocked: use pnpm, not npm. This is a pnpm-workspaces monorepo (ADR-0014); npm corrupts the lockfile. Try `pnpm install` / `pnpm add`.\n' >&2
    exit 2
    ;;
  yarn)
    printf 'blocked: use pnpm, not yarn. This is a pnpm-workspaces monorepo (ADR-0014). Try `pnpm install` / `pnpm add`.\n' >&2
    exit 2
    ;;
esac

exit 0
