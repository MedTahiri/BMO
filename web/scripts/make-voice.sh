#!/usr/bin/env bash
# Generate BMO-style voice lines (original synthetic voice, free to ship) into public/sounds/
# and write public/sounds/sounds.json.  Needs: espeak-ng, ffmpeg (with rubberband).
#   bash scripts/make-voice.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/sounds
mkdir -p "$OUT"
TMP="$(mktemp -d)"

# Voice character: high female espeak voice, pitched up with shifted formants (childlike),
# a touch of bit-crush (digital) and chorus (robot shimmer).
VOICE="en-us+f4"
PITCH=85      # espeak base pitch 0-99
SPEED=160     # words per minute
FX="silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,rubberband=pitch=1.32:formant=shifted,highpass=f=170,acrusher=bits=11:mix=0.22:mode=log:aa=1,chorus=0.7:0.9:35:0.35:0.3:2.2,loudnorm=I=-17:TP=-2:LRA=7"

say() { # name text
  espeak-ng -v "$VOICE" -p "$PITCH" -s "$SPEED" -a 170 -w "$TMP/$1.wav" "$2"
  ffmpeg -y -loglevel error -i "$TMP/$1.wav" -af "$FX" -ac 1 -ar 32000 -c:a libmp3lame -b:a 64k "$OUT/$1.mp3"
}

# name|text   (several files per sound → one is picked at random)
LINES=(
  "hello1|Hello!"            "hello2|Hi, friend!"        "hello3|Hey hey!"
  "laugh1|Hee hee hee!"      "laugh2|Ha ha ha!"          "laugh3|Yay!"
  "surprise1|Oh!"            "surprise2|Whoa!"           "surprise3|Oh my!"
  "sad1|Oh no..."            "sad2|Aww..."               "sad3|So sad."
  "babble1|bee"              "babble2|boo"               "babble3|bip"
  "babble4|bah"              "babble5|mo"                "babble6|dee"
  "plop|Oof!"
  "boot|Bee, Em, Oh!"
  "select|Let's play!"
  "win|I win! Yay!"
  "gameover|Game over."
  "poweron|Hello!"
  "poweroff|Bye bye!"
)
for l in "${LINES[@]}"; do say "${l%%|*}" "${l#*|}"; done
rm -rf "$TMP"

cat > "$OUT/sounds.json" <<'JSON'
{
  "hello": ["hello1.mp3", "hello2.mp3", "hello3.mp3"],
  "laugh": ["laugh1.mp3", "laugh2.mp3", "laugh3.mp3"],
  "surprise": ["surprise1.mp3", "surprise2.mp3", "surprise3.mp3"],
  "sad": ["sad1.mp3", "sad2.mp3", "sad3.mp3"],
  "babble": ["babble1.mp3", "babble2.mp3", "babble3.mp3", "babble4.mp3", "babble5.mp3", "babble6.mp3"],
  "plop": "plop.mp3",
  "boot": "boot.mp3",
  "select": "select.mp3",
  "win": "win.mp3",
  "gameOver": "gameover.mp3",
  "powerOn": "poweron.mp3",
  "powerOff": "poweroff.mp3"
}
JSON
ls -la "$OUT" | tail -n +2
du -sh "$OUT"
