#!/usr/bin/env bash
# commit-msg hook: enforce Conventional Commits + scope coverage vs staged packages/*.
# Invoked by lefthook via `commit-msg` stage. Arg $1 = path to commit message file.

set -uo pipefail

msg_file="${1:-}"
if [ -z "$msg_file" ] || [ ! -f "$msg_file" ]; then
  exit 0
fi

subject=$(head -1 "$msg_file")

# skip release commits and merges
case "$subject" in
  "Merge "*|"chore(release)"*) exit 0 ;;
esac

if ! printf '%s' "$subject" | grep -qE '^[a-z]+(\([a-z0-9,_-]+\))?!?: '; then
  printf 'Commit subject not Conventional Commits format.\nGot: %s\n' "$subject" >&2
  exit 1
fi

scope_part=$(printf '%s' "$subject" | sed -nE 's/^[a-z]+\(([a-z0-9,_-]+)\)!?:.*/\1/p')

if [ -z "$scope_part" ]; then
  printf 'Commit subject missing scope. Format: type(scope): subject\nGot: %s\n' "$subject" >&2
  exit 1
fi

staged_pkgs=$(git diff --cached --name-only 2>/dev/null | awk -F/ '$1=="packages"{print $2}' | sort -u)

if [ -z "$staged_pkgs" ]; then exit 0; fi

IFS=',' read -ra scopes <<< "$scope_part"
missing=()
for pkg in $staged_pkgs; do
  found=0
  for s in "${scopes[@]}"; do
    if [ "$s" = "$pkg" ]; then found=1; break; fi
  done
  [ $found -eq 0 ] && missing+=("$pkg")
done

if [ ${#missing[@]} -gt 0 ]; then
  printf 'Commit scope missing packages: %s\n' "${missing[*]}" >&2
  printf 'Subject: %s\n' "$subject" >&2
  printf 'Scopes:  %s\n' "$scope_part" >&2
  printf 'Staged:  %s\n' "$(echo $staged_pkgs)" >&2
  printf 'Add the missing packages to the scope (comma-separated, no spaces) or split the commit.\n' >&2
  exit 1
fi

exit 0
