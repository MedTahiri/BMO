# BMO – rigged & animatable Blender model

Procedural model of BMO (Adventure Time), built entirely by `bmo_build.py` (Blender 5.1).

| File | What |
|---|---|
| `bmo_build.py` | Generates the whole scene and saves `bmo.blend` |
| `bmo.blend` | Ready-to-open result |
| `render_previews.py` | Renders preview stills to `renders/` |
| `render_videos.py` / `make_videos.sh` | Render every animation clip → `videos/*.mp4` |
| `blender.sh` | Runs the Flatpak Blender with the fixed color config in `.ocio/` |
| `renders/` | Preview images |
| `videos/` | One MP4 per animation + `bmo_open_close.mp4` |
| `export_web.py` | Exports the web model (GLB + `clips.json` property tracks) |
| `web/` | React + three.js website presenting BMO |

## Rebuild / render

```bash
./blender.sh -b --factory-startup --python bmo_build.py -- --out bmo.blend
./blender.sh -b bmo.blend --python render_previews.py -- renders              # all stills
./make_videos.sh                                                              # all videos
./make_videos.sh Sit,Sad                                                      # some videos
./blender.sh bmo.blend                                                        # open the GUI with working colors
```
Render the showreel: open `bmo.blend` → Render → Render Animation (EEVEE, 1920×1080, frames 1–1009).

## What's in the model

- **Shell**: hollow teal case with rounded body corners (like the printed figure), screw posts, 7-hole speaker grille, raised **BM** letters (the arm socket forms the "O"), 5 rear vents, and a **battery bay** with 2 AA cells, contacts and a hinged drop-down door
- **Faceplate** (hinged on the left edge): screen window, cartridge slot, controller port, D-pad, triangle, green, red and blue buttons, two dash buttons, 4 countersunk screws (with threads)
- **PCB** behind the faceplate: contact pads, chips with legs, pin headers, capacitors and traces
- **Screen module**: emissive LCD with a pixel grid. The face is real geometry: eyes, plus a mouth with shape keys (Smile / Open / Frown / Surprise)
- **Internals**: mint screen block over a stepped mustard cartridge drive (slot + glowing LEDs), grey power block with sockets, arched rainbow tubes, gold hourglass, and BMO's **heart**: a puffy 3D heart with a sleepy sculpted face and a gold medal (it beats)
- **Limbs**: skinned noodle arms with little fingers; chunky dark-teal legs with round boot feet
- **Accessories**: game controller whose cable is hooked to the front port and follows BMO, an insertable cartridge, a floor cartridge, screwdriver, spare screws
- **Stage**: curved backdrop, 3 area lights, camera with a Track-To target

## Animating

Select **BMO_Rig**. Everything is keyframable from its **Object → Custom Properties**:

| Property | Effect |
|---|---|
| `lid_open` 0–1 | faceplate swings open on its hinge |
| `explode` 0–1 | exploded view: plate, PCB, spinning screws and screen fly forward |
| `back_open` 0–1 | rear battery door swings down on its hinge, showing the 2 AA cells |
| `face_smile` / `face_open` / `face_frown` / `face_surprise` | mouth expressions (mixable) |
| `blink`, `eye_look_x`, `eye_look_z`, `eyes_happy` | eyes (`eyes_happy` turns them into ^ ^ arcs) |
| `screen_on` 0–3 | LCD brightness (flicker, power off) |
| `cartridge_insert` 0–1 | slides a cartridge into the slot (hidden at 0) |

**Bones** (Pose Mode): `root` (move the whole character), `body` (bob/tilt; all rigid parts follow), `arm_upper/arm_lower/hand.L/R` (FK), and the leg IK controls `foot_ik.L/R` and `knee_pole.L/R`.

**Actions** (switch them in Dope Sheet → Action Editor): `BMO_Idle` (loop), `BMO_Wave`, `BMO_Walk` (in-place loop), `BMO_Talk`, `BMO_OpenLid`, `BMO_BatteryDoor`, `BMO_Explode`, `BMO_PlayGame`, `BMO_Sit`, `BMO_Sad`, plus `BMO_Showreel` (all of them in a row, with timeline markers; it's assigned by default).

The drivers only use simple expressions, so they work without enabling "Auto Run Python Scripts".

## Website (`web/`)

A scroll-story fan page (React 19 + Vite + @react-three/fiber + drei + zustand) with 9 sections: hero, meet BMO, face & feelings, anatomy (scroll opens the faceplate, then explodes it, with hotspots on the parts), battery bay, **BMO Arcade**, **BMO TV**, moves gallery and fun facts.

- **BMO Arcade** runs on BMO's LCD (`web/src/games/`). There are 3 games named after games BMO plays in the show: *Guardians of Sunshine* (beat Bouncy Bee, Hunny Bunny and Sleepy Sam), *Lumpy Space Invaders* and *Bug Battle*. Only the titles and boss names come from the show; the gameplay is my interpretation. You play with BMO's 3D buttons (click them) or the keyboard (arrows/WASD, Z/Space, X, Enter, Esc).
- **BMO TV** plays official Cartoon Network Adventure Time clips (YouTube embeds kept aligned over BMO's screen) or a video you load from your computer (shown on the LCD as a texture; it never leaves the browser). BMO's buttons are the remote: red play/pause, D-pad seek/volume, green mute, triangle/dashes next channel, blue dot TV off. It also has a **Free play** drawer with every animation, expression and control slider.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in web/dist
npm run model      # re-export bmo.glb + clips.json from bmo.blend after changing the model
```

How it works:
- glTF can't carry Blender drivers. `export_web.py` exports meshes, the skin, the mouth morph targets and the 10 bone clips to GLB, and samples the custom-property curves (lid, face, eyes…) to `clips.json`. `web/src/three/drivers.ts` re-implements the drivers 1:1.
- Clicking things on BMO works: buttons (D-pad looks around, red laughs, green blinks, triangle gasps, blue dot toggles the screen, dashes talk), the heart, the battery door and the faceplate. Clicking the body makes BMO wave. Drag sideways to spin BMO.
- Performance:
  - three.js loads in a lazy chunk (first paint ≈ 75 KB gzip of JS)
  - GLB is lossless meshopt, 761 KB (≈ 320 KB gzip)
  - studio lighting comes from a procedural PMREM, with no HDR download
  - blob shadow instead of shadow maps
  - raycasting is limited to clickable parts, and static parts skip matrix updates
  - adaptive DPR via PerformanceMonitor
  - honors `prefers-reduced-motion`

## Note about the Flatpak Blender

The Flatpak (5.1.1) bundles an OCIO config of version 2.5, but its OpenColorIO library is 2.4, so color management falls back to raw output. `.ocio/` holds a copy of Blender's config, downgraded to 2.4 by removing three 2.5-only keys. `blender.sh` points Blender at it, so Standard/AgX/Filmic work again. Use `./blender.sh` instead of `flatpak run org.blender.Blender`.
