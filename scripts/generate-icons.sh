#!/bin/bash
# Regenerates every app icon from assets/icon-source.jpg.
#
# Uses macOS `sips` rather than Pillow: Pillow is installed on the owner's machine but unusable
# there — its native `_imaging` module is an x86_64 build on an arm64 Mac, so `import PIL`
# succeeds and any actual image work fails. `sips` ships with macOS and is always native.
#
# Run from the repo root:  ./scripts/generate-icons.sh
set -euo pipefail

SOURCE="assets/icon-source.jpg"
OUT="public/icons"
SAFE_ZONE_512=410   # 80% of 512 — a maskable icon's outer 10% per side may be cropped
SAFE_ZONE_192=154   # 80% of 192
WHITE="FFFFFF"      # matches the source artwork's own field, so the pad is invisible

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# "any" icons — the artwork fills the frame.
sips -s format png -z 512 512 "$SOURCE" --out "$OUT/icon-512.png" >/dev/null
sips -s format png -z 192 192 "$SOURCE" --out "$OUT/icon-192.png" >/dev/null

# apple-touch-icon — opaque and square; iOS applies its own squircle mask, and any transparency
# would composite against black.
sips -s format png -z 180 180 "$SOURCE" --out "$OUT/apple-touch-icon-180.png" >/dev/null

# maskable icons — artwork scaled into the inner 80%, then padded to full bleed. The background
# must reach every edge or a circular mask shows transparent corners.
sips -s format png -z "$SAFE_ZONE_512" "$SAFE_ZONE_512" "$SOURCE" --out "$TMP/m512.png" >/dev/null
sips -p 512 512 --padColor "$WHITE" "$TMP/m512.png" --out "$OUT/icon-512-maskable.png" >/dev/null
sips -s format png -z "$SAFE_ZONE_192" "$SAFE_ZONE_192" "$SOURCE" --out "$TMP/m192.png" >/dev/null
sips -p 192 192 --padColor "$WHITE" "$TMP/m192.png" --out "$OUT/icon-192-maskable.png" >/dev/null

echo "Regenerated 5 icons in $OUT from $SOURCE"
