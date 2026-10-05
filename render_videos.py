"""
Render each BMO animation clip to a PNG sequence (encoded to MP4 by make_videos.sh).
    ./blender.sh -b bmo.blend --python render_videos.py -- <frames_dir> [Clip,Clip,...]
"""
import bpy
import os
import sys

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frames_dir = os.path.abspath(args[0] if args else ".frames")
only = args[1].split(",") if len(args) > 1 else None

scene = bpy.context.scene
rig = bpy.data.objects["BMO_Rig"]
cam = bpy.data.objects["Camera"]
target = bpy.data.objects["Camera_Target"]
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.image_settings.file_format = 'PNG'
try:
    scene.eevee.taa_render_samples = 24
except Exception:
    pass

# clip -> (camera location, camera target, lens, frames to render (None = action range))
SHOTS = {
    "Idle": ((3.3, -5.0, 2.5), (0, -0.1, 0.95), 50, None),
    "Wave": ((3.0, -4.8, 2.2), (0.1, -0.1, 1.05), 50, None),
    "Walk": ((4.6, -3.0, 1.6), (0, -0.1, 0.8), 50, 96),
    "Talk": ((1.7, -3.6, 1.8), (0, -0.1, 1.2), 50, None),
    "OpenLid": ((2.4, -4.2, 2.2), (-0.25, -0.45, 1.0), 42, None),
    "BatteryDoor": ((-2.3, 3.0, 1.6), (0, 0.3, 0.85), 50, None),
    "Explode": ((4.4, -4.6, 3.2), (0, -0.5, 1.1), 42, None),
    "PlayGame": ((2.0, -3.6, 1.9), (0, -0.4, 1.0), 50, None),
    "Sit": ((2.9, -4.4, 1.6), (0, -0.2, 0.7), 50, None),
    "Sad": ((2.0, -4.0, 1.8), (0, -0.1, 1.0), 50, None),
}

for name, (cl, tl, lens, nframes) in SHOTS.items():
    if only and name not in only:
        continue
    act = bpy.data.actions.get(f"BMO_{name}")
    if act is None:
        continue
    rig.animation_data.action = act
    start, end = int(act.frame_range[0]), int(act.frame_range[1])
    if nframes:
        end = start + nframes - 1
    scene.frame_start, scene.frame_end = start, end
    cam.location, target.location, cam.data.lens = cl, tl, lens
    out = os.path.join(frames_dir, name)
    os.makedirs(out, exist_ok=True)
    scene.render.filepath = os.path.join(out, "f_")
    bpy.ops.render.render(animation=True)
    print("CLIP DONE", name, start, end)
