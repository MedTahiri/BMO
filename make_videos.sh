#!/usr/bin/env bash
# Render every animation clip of bmo.blend and encode MP4s into videos/.
#   ./make_videos.sh            # all clips
#   ./make_videos.sh Wave,Sit   # some clips
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
FRAMES="$DIR/.frames"
CLIPS="${1:-Idle,Wave,Walk,Talk,OpenLid,BatteryDoor,Explode,PlayGame,Sit,Sad}"
mkdir -p videos "$FRAMES"

./blender.sh -b bmo.blend --python render_videos.py -- "$FRAMES" "$CLIPS" 2>&1 | grep -E "CLIP DONE|Error" || true

# H.264: libx264 if present, otherwise OpenH264 (Fedora's ffmpeg ships without libx264)
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then
  VCODEC=(-c:v libx264 -crf 18)
else
  VCODEC=(-c:v libopenh264 -b:v 8M)
fi
encode() {  # $1 = clip name, $2 = output file
  ffmpeg -y -loglevel error -framerate 24 -pattern_type glob -i "$FRAMES/$1/f_*.png" \
    "${VCODEC[@]}" -pix_fmt yuv420p -movflags +faststart "$2"
}
IFS=',' read -ra LIST <<< "$CLIPS"
for c in "${LIST[@]}"; do
  [ -d "$FRAMES/$c" ] && encode "$c" "videos/bmo_${c,,}.mp4" && echo "videos/bmo_${c,,}.mp4"
done

# open & close video: faceplate open/close followed by the battery door open/close
if [ -f videos/bmo_openlid.mp4 ] && [ -f videos/bmo_batterydoor.mp4 ]; then
  ffmpeg -y -loglevel error -i videos/bmo_openlid.mp4 -i videos/bmo_batterydoor.mp4 \
    -filter_complex "[0:v][1:v]concat=n=2:v=1[v]" -map "[v]" "${VCODEC[@]}" -pix_fmt yuv420p \
    -movflags +faststart videos/bmo_open_close.mp4 && echo videos/bmo_open_close.mp4
fi
