#!/usr/bin/env bash
# PreToolUse hook for Bash: gate agent-initiated `git push` force-pushes.
#
#   - force-push that positively targets main/master  -> deny  (agent cannot proceed)
#   - force-push to any other / indeterminate target   -> ask   (harness confirm/decline)
#   - non-force push, or not a push at all             -> pass  (exit 0, no output)
#
# Mechanism: emit harness-native permission JSON on stdout and exit 0. (An exit 2
# would unconditionally block and ignore the JSON.) See issue #457.
#
# Structure-aware, not substring: quoted segments are stripped before matching so a
# command that merely *mentions* a force-push in a string arg (e.g. drafting docs,
# `gh issue create --body '... git push --force ...'`) does not false-positive (#457 story 12).
#
# Agent-only by nature: PreToolUse governs Bash tool calls; a human typing the same
# command in their own terminal is never intercepted (accepted scope, #457).

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

[ -z "$cmd" ] && exit 0

# Strip single- and double-quoted segments so force-push text inside string args
# is not mistaken for an actual command. Good-enough heuristic for dev tooling.
stripped=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")

# Tokenize the de-quoted command (read -ra does not glob-expand).
read -ra toks <<< "$stripped"
n=${#toks[@]}

# Locate a real `git ... push` invocation: a `git` word whose first non-option
# subcommand (after skipping `-C dir` / `-c k=v` / other flags) is `push`.
push_idx=-1
for ((i = 0; i < n; i++)); do
  [ "${toks[$i]}" = "git" ] || continue
  j=$((i + 1))
  while [ $j -lt $n ]; do
    case "${toks[$j]}" in
      -C|-c) j=$((j + 2)); continue ;; # flag takes a value
      -*) j=$((j + 1)); continue ;;
      *) break ;;
    esac
  done
  if [ $j -lt $n ] && [ "${toks[$j]}" = "push" ]; then
    push_idx=$j
    break
  fi
done

[ "$push_idx" -ge 0 ] || exit 0

# Inspect the push args: detect force flags, the remote, and any explicit refspec
# whose destination branch is main/master.
force=0
explicit_refspec=0
refspec_main=0
remote_seen=0
for ((k = push_idx + 1; k < n; k++)); do
  t="${toks[$k]}"
  case "$t" in
    --force|--force-with-lease|--force-with-lease=*) force=1; continue ;;
    -f*) force=1; continue ;; # standalone -f (or bundled short flags starting with f)
    --*|-*) continue ;;       # any other option
  esac

  # Non-option token: a `+`-prefixed refspec is itself a force-push (#457 story 5).
  rs="$t"
  case "$rs" in
    +*) force=1; rs="${rs#+}" ;;
  esac

  # First non-option positional is the remote (e.g. `origin`); the rest are refspecs.
  if [ "$remote_seen" -eq 0 ]; then
    remote_seen=1
    continue
  fi

  explicit_refspec=1
  dst="${rs##*:}" # destination side of src:dst (whole token if no colon)
  case "$dst" in
    main|master) refspec_main=1 ;;
  esac
done

# Non-force push -> untouched.
[ "$force" -eq 1 ] || exit 0

# Resolve whether this positively targets main/master.
#   1. an explicit refspec naming main/master  -> yes
#   2. no explicit refspec, command did not cd elsewhere, and HEAD is main/master -> yes
# Anything indeterminate (worktree cd, unresolvable HEAD, no branch token) -> no -> ask.
is_main=0
if [ "$refspec_main" -eq 1 ]; then
  is_main=1
elif [ "$explicit_refspec" -eq 0 ]; then
  if ! printf '%s' "$stripped" | grep -qE '(^|[;&|]|[[:space:]])cd[[:space:]]'; then
    head=$(git -C "${CLAUDE_PROJECT_DIR:-$(pwd)}" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
    case "$head" in
      main|master) is_main=1 ;;
    esac
  fi
fi

if [ "$is_main" -eq 1 ]; then
  decision="deny"
  reason="Force-push targeting main/master is denied for agents — it can rewrite protected-branch history (see #457/#454). If truly intended, run it yourself from your own terminal."
else
  decision="ask"
  reason="Force-push detected — this rewrites remote history. Confirm the target branch is correct before proceeding. Command: ${cmd}"
fi

jq -nc --arg d "$decision" --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
exit 0
