#!/usr/bin/env bash
# Re-export BMO from Blender for the website: bmo.glb (meshopt, lossless) + clips.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/web"
TMP="$(mktemp -d)"
cd "$ROOT"
./blender.sh -b bmo.blend --python export_web.py -- "$TMP" 2>&1 | grep -E "WEB:|Error" || true
cp "$TMP/clips.json" "$WEB/public/models/clips.json"
cd "$WEB"
npx gltf-transform optimize "$TMP/bmo_raw.glb" "$TMP/opt.glb" --compress false --join false --flatten false \
  --instance false --simplify false --texture-compress false --palette false
# "medium" = lossless meshopt: no quantization, so node transforms (hinges, pivots) stay exact
npx gltf-transform meshopt "$TMP/opt.glb" public/models/bmo.glb --level medium
rm -rf "$TMP"
ls -la public/models
