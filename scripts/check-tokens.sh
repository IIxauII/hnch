#!/usr/bin/env bash
# Fail if any deprecated --hnch-* token reappears in packages/client/src.
# After the theming overhaul (May 2026), only --hnch-glass and --hnch-glass-strong
# remain as legitimate brand-private tokens — everything else maps to Ionic-native
# vars (--ion-color-*, --ion-text-color, --ion-background-color, step colors).
#
# Run from repo root:
#   bash scripts/check-tokens.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/packages/client/src"

# Patterns to flag. Each is a forbidden token that should no longer appear in
# component code or theme files (other than as the var definition for the two
# survivors --hnch-glass / --hnch-glass-strong).
PATTERNS=(
  '\-\-hnch-bg'
  '\-\-hnch-surface'
  '\-\-hnch-text'
  '\-\-hnch-muted'
  '\-\-hnch-sep'
  '\-\-hnch-fill'
  '\-\-hnch-success'
  '\-\-hnch-warning'
  '\-\-hnch-danger'
  '\-\-hnch-accent'
)

JOINED="$(IFS='|'; echo "${PATTERNS[*]}")"

if matches="$(grep -rn -E "$JOINED" "$TARGET" 2>/dev/null)"; then
  if [ -n "$matches" ]; then
    echo "✗ Forbidden --hnch-* tokens detected:"
    echo "$matches"
    exit 1
  fi
fi

echo "✓ No forbidden --hnch-* tokens in $TARGET"
exit 0
