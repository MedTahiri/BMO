# Real sounds for BMO

The voice lines here (hello, laugh, surprise, sad, babble, plop, boot, select, win, gameover, poweron,
poweroff) are an **original BMO-style synthetic voice** made by `scripts/make-voice.sh`: espeak-ng,
pitched up with shifted formants, light bit-crush and chorus. No audio from the show is used, so they're
free to ship. Edit the lines or voice settings in that script and re-run it.


Drop audio files (mp3 / ogg / wav) in this folder and list them in `sounds.json`.
Any sound listed there plays your recording instead of the built-in chiptune synth.
Give a list to pick one at random each time.

```json
{
  "hello": "hello.mp3",
  "laugh": ["laugh1.mp3", "laugh2.mp3"],
  "babble": ["talk1.mp3", "talk2.mp3", "talk3.mp3"]
}
```

Sound names:

- BMO's voice: hello (wave), laugh, surprise, sad, babble (talking), blink, plop (sitting down), step
- Buttons: btn_red, btn_green, btn_triangle, btn_dpad, btn_dashes, btn_blue, ui
- Mechanics: lidOpen, lidClose, doorOpen, doorClose, explode, assemble, cartridge, powerOn, powerOff, boot
- Games: menuMove, select, pause, jump, sword, hit, hurt, combo, bossDown, shoot, invaderDie, squash, coin,
  miss, escape, win, gameOver, waveClear

If you add audio from anywhere else, credit it in `LEGAL.soundCredits` in `src/content/bmo.ts`.
Only use audio you have the right to use. Clips ripped from the show are owned by Cartoon Network.
