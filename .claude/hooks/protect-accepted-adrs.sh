#!/usr/bin/env bash
# PreToolUse hook for Edit/Write/MultiEdit: protect accepted ADRs from silent edits.
# Project rule: ADRs are immutable once accepted — to change direction, write a NEW
# superseding ADR, never edit an existing numbered one (CLAUDE.md "ADR requirement").
# Allows: 0000-template.md, README.md, and brand-new ADR files (not yet on disk).
# Blocks: edits to an existing adr/NNNN-*.md. Exit 2 = block + surface stderr to Claude.

set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

[ -z "$file" ] && exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# only guard files under adr/
case "$file" in
  "$REPO"/adr/*) ;;
  *) exit 0 ;;
esac

base=$(basename "$file")

# template + readme are freely editable
case "$base" in
  0000-template.md|README.md) exit 0 ;;
esac

# only numbered ADRs are protected
printf '%s' "$base" | grep -qE '^[0-9]{4}-.+\.md$' || exit 0

# a brand-new ADR (file not yet on disk) is allowed — that's how you supersede
[ -f "$file" ] || exit 0

# Status-line-only Edit is allowed: supersession/de-overload is editorial, not a
# decision-body change. Pass only when BOTH old_string and new_string are a single
# line beginning with the Status header — so the immutable body cannot be touched.
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')
if [ "$tool" = "Edit" ]; then
  old=$(printf '%s' "$input" | jq -r '.tool_input.old_string // ""')
  new=$(printf '%s' "$input" | jq -r '.tool_input.new_string // ""')
  case "$old$new" in
    *$'\n'*) ;;  # multi-line → fall through to block
    *)
      if printf '%s' "$old" | grep -qE '^\*\*Status:\*\*' \
        && printf '%s' "$new" | grep -qE '^\*\*Status:\*\*'; then
        exit 0
      fi
      ;;
  esac
fi

printf 'blocked: %s is an accepted ADR and is immutable (CLAUDE.md "ADR requirement").\n' "$base" >&2
printf 'To change direction, write a NEW superseding ADR (status: Superseded by ADR-XXXX) instead of editing this one.\n' >&2
printf 'Minor fixes (typos, broken links) are allowed — if that is the case, ask the user to bypass this guard.\n' >&2
exit 2
