#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip.
#
# The file list is explicit rather than an exclude-glob: the whole safety
# argument for this extension is that nothing unexpected ships inside it,
# and an allowlist is the only version of that which can't drift.
set -euo pipefail

cd "$(dirname "$0")"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="roster-loom-connector-${VERSION}.zip"

FILES=(
  manifest.json
  popup.html
  popup.css
  popup.js
  espn-cookies.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

for file in "${FILES[@]}"; do
  [ -f "$file" ] || { echo "missing: $file" >&2; exit 1; }
done

rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"
echo "$OUT"
unzip -l "$OUT"
