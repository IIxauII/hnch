#!/bin/bash
#
# Token discipline check — ensure rogue font-family declarations and px literals
# are not used outside the theme variables file.
#
# Usage: ./scripts/check-tokens.sh
# Exit 0 if all checks pass; exit 1 if violations found.
#

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VIOLATIONS=0

# Check 1: grep rogue font-family outside variables.scss
echo "Checking for rogue font-family declarations..."
if grep -rE "font-family:\s*['\"]?(Fraunces|Inter Tight|Inter|Georgia|monospace|sans-serif|serif)" \
  packages/client/src \
  --include='*.scss' --include='*.ts' \
  | grep -v "packages/client/src/theme/variables.scss"; then
  echo "ERROR: Found font-family declarations outside variables.scss"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check 2: grep legacy token names still in use
echo "Checking for legacy token names..."
if grep -rE "\-\-hnch-(radius-pill|spacing-tight|spacing-loose|accent-warm|card-shadow-elevated|vote-glow)" \
  packages/client/src \
  --include='*.scss' --include='*.ts'; then
  echo "ERROR: Found legacy token references"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check 3: grep rogue px literals in spacing/radius contexts
echo "Checking for rogue px literals..."
if grep -rE "padding:\s*(6|10|14|18|22|30|36)px|margin:\s*(6|10|14|18|22|30|36)px|border-radius:\s*(6|10|14|20|28)px" \
  packages/client/src \
  --include='*.scss' --include='*.ts'; then
  echo "ERROR: Found rogue px literals (should use --hnch-sp-* or --hnch-r-*)"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ $VIOLATIONS -gt 0 ]; then
  echo ""
  echo "Token check FAILED: $VIOLATIONS violation(s) found."
  exit 1
fi

echo "Token check PASSED."
exit 0
