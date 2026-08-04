#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$(cd "$REPO_DIR/.." && pwd)}"
KEY_PATH="$OUTPUT_DIR/FBUnsave.pem"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
VERSION="$(jq -r '.version' "$REPO_DIR/manifest.json")"
ARCHIVE_BASENAME="FBUnsave-$VERSION"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fbunsave-release.XXXXXX")"
STAGE_DIR="$TEMP_DIR/$ARCHIVE_BASENAME"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

RUNTIME_FILES=(
  manifest.json
  content.js
  messenger-marketplace.js
  price-tracker.js
  popup.html
  popup.js
  icon16.png
  icon48.png
  icon128.png
)

mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"
for file in "${RUNTIME_FILES[@]}"; do
  cp "$REPO_DIR/$file" "$STAGE_DIR/$file"
done

VERSIONED_ZIP="$OUTPUT_DIR/$ARCHIVE_BASENAME.zip"
CANONICAL_ZIP="$OUTPUT_DIR/FBUnsave.zip"

(
  cd "$STAGE_DIR"
  zip -X -q "$VERSIONED_ZIP" "${RUNTIME_FILES[@]}"
)
unzip -tq "$VERSIONED_ZIP"
cp "$VERSIONED_ZIP" "$CANONICAL_ZIP"

if [[ -x "$CHROME_BIN" && -f "$KEY_PATH" ]]; then
  "$CHROME_BIN" \
    --user-data-dir="$TEMP_DIR/chrome-profile" \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-networking \
    --pack-extension="$STAGE_DIR" \
    --pack-extension-key="$KEY_PATH" \
    >/dev/null 2>&1

  VERSIONED_CRX="$OUTPUT_DIR/$ARCHIVE_BASENAME.crx"
  CANONICAL_CRX="$OUTPUT_DIR/FBUnsave.crx"
  mv "$TEMP_DIR/$ARCHIVE_BASENAME.crx" "$VERSIONED_CRX"
  cp "$VERSIONED_CRX" "$CANONICAL_CRX"
fi

echo "Built $VERSIONED_ZIP"
if [[ -f "$OUTPUT_DIR/$ARCHIVE_BASENAME.crx" ]]; then
  echo "Built $OUTPUT_DIR/$ARCHIVE_BASENAME.crx"
fi
