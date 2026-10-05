#!/usr/bin/env bash
# Import BMO voice lines you generate by hand on fish.audio (or anywhere).
# Run this, then on https://fish.audio/m/94b4570683534e37993fdffbd47d084b/ type the line shown,
# generate, and download it. Each new audio file that lands in ~/Downloads is renamed to the next
# slot, trimmed, loudness-matched and saved to public/sounds/. Ctrl+C to stop; re-run to resume.
#   bash scripts/import-voice.sh            # watch ~/Downloads
#   bash scripts/import-voice.sh /some/dir  # watch another folder
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/sounds
WATCH="${1:-$HOME/Downloads}"
DONE_FILE="$OUT/.imported"
touch "$DONE_FILE"

LINES=(
  "hello1|Hello!"            "hello2|Hi, friend!"        "hello3|Hey hey!"
  "laugh1|Hee hee hee!"      "laugh2|Ha ha ha!"          "laugh3|Yay!"
  "surprise1|Oh!"            "surprise2|Whoa!"           "surprise3|Oh my!"
  "sad1|Oh no..."            "sad2|Aww..."               "sad3|So sad."
  "babble1|Bee!"             "babble2|Boo!"              "babble3|Bip!"
  "babble4|Bah!"             "babble5|Mo!"               "babble6|Dee!"
  "plop|Oof!"                "boot|B M O!"               "select|Let's play!"
  "win|I win! Yay!"          "gameover|Game over."       "poweron|Hello!"
  "poweroff|Bye bye!"
)

marker="$(mktemp)"   # only files downloaded after start count
trap 'rm -f "$marker"' EXIT
for l in "${LINES[@]}"; do
  name="${l%%|*}"; text="${l#*|}"
  grep -qx "$name" "$DONE_FILE" && continue
  printf '\n▶ Next line: \033[1m%s\033[0m   (saves as %s.mp3; type "s" + Enter to skip)\n' "$text" "$name"
  command -v wl-copy >/dev/null && printf '%s' "$text" | wl-copy 2>/dev/null && echo "  (copied to clipboard)"
  while :; do
    if read -t 1 -r ans && [ "$ans" = "s" ]; then echo "  skipped"; break; fi
    f=$(find "$WATCH" -maxdepth 1 -type f \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.m4a' -o -iname '*.opus' \) \
        -newer "$marker" ! -name '*.part' ! -name '*.crdownload' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -n "$f" ]; then
      sleep 1 # let the browser finish writing
      ffmpeg -y -loglevel error -i "$f" \
        -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-17:TP=-2:LRA=7" \
        -ac 1 -ar 32000 -c:a libmp3lame -b:a 64k "$OUT/$name.mp3"
      echo "$name" >> "$DONE_FILE"
      touch "$marker"
      printf '  ✓ %s.mp3  (from %s)\n' "$name" "$(basename "$f")"
      break
    fi
  done
done
echo; echo "All lines done. Refresh the site, then switch the voice credit in src/content/bmo.ts (LEGAL)."
