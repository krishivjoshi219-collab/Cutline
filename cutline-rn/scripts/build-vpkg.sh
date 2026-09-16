#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OUT_DIR="$ROOT_DIR/build/vega"
VPKG_NAME="cutline-firetv-v0.1.0.vpkg"
VPKG_PATH="$ROOT_DIR/../$VPKG_NAME"
ARTIFACTS_PATH="$ROOT_DIR/../artifacts/$VPKG_NAME"

mkdir -p "$OUT_DIR"
mkdir -p "$ROOT_DIR/../artifacts"

echo "=========================================="
echo " Packaging Cutline for Amazon Vega OS"
echo "=========================================="

# Bundle TypeScript / JavaScript for Amazon Kepler (Vega OS) Runtime
npx --yes esbuild "$ROOT_DIR/index.js" \
  --bundle \
  --platform=neutral \
  --format=cjs \
  --external:react \
  --external:react-native \
  --external:expo \
  --external:react-native-video \
  --external:react-native-keep-awake \
  --external:@react-native-async-storage/async-storage \
  --outfile="$OUT_DIR/index.bundle.js"

# Include VegaOS TOML manifest
cp "$ROOT_DIR/manifest.toml" "$OUT_DIR/manifest.toml"

# Include package metadata
cp "$ROOT_DIR/package.json" "$OUT_DIR/package.json"
cp "$ROOT_DIR/app.json" "$OUT_DIR/app.json"

# Package as .vpkg (ZIP archive for Vega OS)
cd "$OUT_DIR"
rm -f "$VPKG_PATH" "$ARTIFACTS_PATH"
zip -r "$VPKG_PATH" manifest.toml index.bundle.js package.json app.json
cp "$VPKG_PATH" "$ARTIFACTS_PATH"

echo "=========================================="
echo " Generated Vega OS Package:"
echo " $VPKG_PATH"
echo "=========================================="
ls -lh "$VPKG_PATH"
