#!/usr/bin/env bash
# Renders the app icons from scripts/icons/paw.html into app/.
#
# Output (declared by hand in app/layout.tsx's `icons` metadata):
#   public/favicon.ico          16 + 32 + 48, multi-size
#   public/icon-512.png         512 — general-purpose
#   public/apple-touch-icon.png 180 — iOS home screen
#
# These live in public/ rather than using Next's app/icon.* file convention on
# purpose. Turbopack *decodes* an app/favicon.ico at build time and rejects any
# embedded PNG that isn't RGBA ("The PNG is not in RGBA format!"); headless
# Chrome writes colour type 2 for a fully opaque page and no flag reliably
# changes that. public/ is copied verbatim, so nothing decodes it.
#
# Every small size is rendered *natively* at its own --window-size rather than
# downscaled from 512: downscaling blurs the pixel grid, which is exactly what
# kills a 16px icon. There's no ICO encoder on this machine, so make-ico.py
# writes the container by hand.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/scripts/icons/paw.html"
OUT="$ROOT/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CHROME="$(find "$HOME/Library/Caches/ms-playwright" -maxdepth 4 -name chrome-headless-shell 2>/dev/null | sort | tail -1)"
if [ -z "$CHROME" ]; then
  echo "No headless Chrome found under ~/Library/Caches/ms-playwright" >&2
  exit 1
fi

shoot() { # size variant outfile
  local size="$1" variant="$2" out="$3"
  # --default-background-color=00000000 is not about transparency here: the page
  # paints an opaque amber field either way. It makes Chrome emit an *alpha
  # channel* (PNG colour type 6 rather than 2), and Turbopack's ICO decoder
  # rejects any embedded PNG that isn't RGBA — "The PNG is not in RGBA format!"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size="$size,$size" --virtual-time-budget=1500 \
    --default-background-color=00000000 \
    --allow-file-access-from-files \
    --screenshot="$out" "file://$SRC#$variant" 2>/dev/null
}

# ICO members, each at its native size. 16px gets its own three-toe geometry —
# see the comment in paw.html for why four toes can't survive there.
shoot 16 tiny  "$TMP/16.png"
shoot 32 small "$TMP/32.png"
shoot 48 small "$TMP/48.png"
python3 "$ROOT/scripts/icons/make-ico.py" "$OUT/favicon.ico" "$TMP/16.png" "$TMP/32.png" "$TMP/48.png"
echo "wrote public/favicon.ico (16, 32, 48)"

# Large sizes — the detailed geometry.
shoot 512 large "$OUT/icon-512.png"
echo "wrote public/icon-512.png"
shoot 180 large "$OUT/apple-touch-icon.png"
echo "wrote public/apple-touch-icon.png"
