#!/usr/bin/env bash
# Renders the share cards in public/og/ from scripts/og/card.html.
#
# There is no sharp/ImageMagick on the machines this repo is edited from, so the
# renderer is Playwright's cached headless Chrome and the downscale is `sips`.
# Rendering at 2× and halving is noticeably crisper than a 1× render, and
# --virtual-time-budget is what waits for the webfonts — without it the text
# comes out in a fallback face.
#
# Usage:  scripts/og/render.sh            # all cards
#         scripts/og/render.sh partner    # just one
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/og"
SRC="$ROOT/scripts/og/card.html"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CHROME="$(find "$HOME/Library/Caches/ms-playwright" -maxdepth 4 -name chrome-headless-shell 2>/dev/null | sort | tail -1)"
if [ -z "$CHROME" ]; then
  echo "No headless Chrome found under ~/Library/Caches/ms-playwright" >&2
  exit 1
fi

VARIANTS=("$@")
if [ ${#VARIANTS[@]} -eq 0 ]; then
  VARIANTS=(home register partner apply)
fi

mkdir -p "$OUT"

for variant in "${VARIANTS[@]}"; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=1200,630 \
    --virtual-time-budget=6000 --allow-file-access-from-files \
    --screenshot="$TMP/$variant.png" "file://$SRC#$variant" 2>/dev/null
  sips -z 630 1200 "$TMP/$variant.png" --out "$OUT/$variant.png" >/dev/null
  echo "rendered public/og/$variant.png"
done
