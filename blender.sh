#!/usr/bin/env bash
# Run the Flatpak Blender with a patched OCIO config (the Flatpak's bundled config is
# version 2.5 but its OpenColorIO library is 2.4, which disables AgX/Filmic/Standard).
# The patched copy is created in .ocio/ on first run.
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$DIR/.ocio/config.ocio" ]; then
  mkdir -p "$DIR/.ocio"
  flatpak run --command=sh org.blender.Blender -c \
    'cp -r /app/share/blender/*/datafiles/colormanagement/. "$0"' "$DIR/.ocio"
  sed -i -E 's/^ocio_profile_version: 2\.5/ocio_profile_version: 2.4/; /^\s*(interop_id|interchange):/d; /^      icc_profile_name:/d' \
    "$DIR/.ocio/config.ocio"
fi
exec flatpak run --env=OCIO="$DIR/.ocio/config.ocio" org.blender.Blender "$@"
