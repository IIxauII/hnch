#!/usr/bin/env bash
# PreToolUse hook for Edit/Write/MultiEdit: protect accepted ADRs from silent edits.
# Project rule: ADRs are immutable once accepted — to change direction, write a NEW
# superseding ADR, never edit an existing numbered one (adr/README.md "Immutability").
# Allows: 0000-template.md, README.md, and brand-new ADR files (not yet on disk).
# Blocks: edits to an existing adr/NNNN-*.md. Exit 2 = block + surface stderr to Claude.

set -uo pipefail

input=$(cat)

# Without jq the path below reads as empty and every edit would pass, so block
# anything that names a numbered ADR until jq (pinned in mise.toml) is on PATH.
if ! command -v jq >/dev/null 2>&1; then
  if printf '%s' "$input" | grep -qE 'adr/[0-9]{4}-[^"]*\.md'; then
    printf 'blocked: jq is not on PATH, so the accepted-ADR guard cannot read this edit. Run `mise install` and start Claude Code from a mise-activated shell.\n' >&2
    exit 2
  fi
  exit 0
fi

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

[ -z "$file" ] && exit 0

# Guard any path with an adr/ segment, not only $CLAUDE_PROJECT_DIR/adr:
# a session rooted in the main checkout can edit a sibling worktree's ADRs.
case "/$file" in
  */adr/*) ;;
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

printf 'blocked: %s is an accepted ADR and is immutable (adr/README.md "Immutability").\n' "$base" >&2
printf 'To change direction, write a NEW superseding ADR (status: Superseded by ADR-XXXX) instead of editing this one.\n' >&2
printf 'Minor fixes (typos, broken links) are allowed — if that is the case, ask the user to bypass this guard.\n' >&2
exit 2
