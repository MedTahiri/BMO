#!/usr/bin/env bash
# Generate BMO's voice lines with the community "bmo" voice model on fish.audio
#   https://fish.audio/m/94b4570683534e37993fdffbd47d084b/   (by Austin, AI character-voice imitation)
#
# Needs a fish.audio API key (https://fish.audio → API keys). Provide it WITHOUT pasting it anywhere:
#   echo 'YOUR_KEY' > ~/.config/fish-audio-key && chmod 600 ~/.config/fish-audio-key
#   bash scripts/make-voice-fish.sh
# (or export FISH_API_KEY=... in your own terminal). Output replaces the synthetic voice in public/sounds/.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/sounds
MODEL_ID="94b4570683534e37993fdffbd47d084b"
KEY="${FISH_API_KEY:-$(cat "$HOME/.config/fish-audio-key" 2>/dev/null || true)}"
if [ -z "$KEY" ]; then
  echo "No API key: set FISH_API_KEY or create ~/.config/fish-audio-key" >&2
  exit 1
fi
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tts() { # name text
  local body code
  body=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "reference_id": sys.argv[2], "format": "mp3", "mp3_bitrate": 128, "normalize": True, "latency": "normal"}))' "$2" "$MODEL_ID")
  code=$(curl -sS -o "$TMP/$1.raw" -w '%{http_code}' -X POST https://api.fish.audio/v1/tts \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "model: s1" -d "$body")
  if [ "$code" != "200" ]; then
    echo "  ✗ $1: HTTP $code: $(head -c 300 "$TMP/$1.raw")" >&2
    return 1
  fi
  # trim silence, even out loudness, small mono mp3 for the web
  ffmpeg -y -loglevel error -i "$TMP/$1.raw" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-17:TP=-2:LRA=7" \
    -ac 1 -ar 32000 -c:a libmp3lame -b:a 64k "$OUT/$1.mp3"
  echo "  ✓ $1  ($2)"
}

# Same file names as scripts/make-voice.sh, so sounds.json keeps working.
LINES=(
  "hello1|Hello!"            "hello2|Hi, friend!"        "hello3|Hey hey!"
  "laugh1|Hee hee hee!"      "laugh2|Ha ha ha!"          "laugh3|Yay!"
  "surprise1|Oh!"            "surprise2|Whoa!"           "surprise3|Oh my!"
  "sad1|Oh no..."            "sad2|Aww..."               "sad3|So sad."
  "babble1|Bee!"             "babble2|Boo!"              "babble3|Bip!"
  "babble4|Bah!"             "babble5|Mo!"               "babble6|Dee!"
  "plop|Oof!"
  "boot|B M O!"
  "select|Let's play!"
  "win|I win! Yay!"
  "gameover|Game over."
  "poweron|Hello!"
  "poweroff|Bye bye!"
)
fail=0
for l in "${LINES[@]}"; do tts "${l%%|*}" "${l#*|}" || fail=1; done
du -sh "$OUT"
if [ "$fail" = 1 ]; then
  echo "Some lines failed (see above). Files that failed keep their previous version." >&2
  exit 1
fi
echo "Done. Refresh the site to hear the fish.audio BMO voice."
