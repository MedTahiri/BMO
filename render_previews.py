"""
Render preview stills of bmo.blend.
    blender -b bmo.blend --python render_previews.py -- [outdir] [shot,shot,...]
"""
import bpy
import os
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
outdir = os.path.abspath(args[0] if args else "renders")
only = set(args[1].split(",")) if len(args) > 1 else None
os.makedirs(outdir, exist_ok=True)

scene = bpy.context.scene
rig = bpy.data.objects["BMO_Rig"]
cam = bpy.data.objects["Camera"]
target = bpy.data.objects["Camera_Target"]
reel = bpy.data.actions.get("BMO_Showreel")
scene.render.resolution_x, scene.render.resolution_y = 1000, 750
scene.render.image_settings.file_format = 'PNG'
try:
    scene.eevee.taa_render_samples = 32
except Exception:
    pass
# Linear output -> apply gamma ourselves when OCIO is unavailable (e.g. some Flatpak builds)
NEEDS_GAMMA = scene.view_settings.view_transform in ('NONE', 'Raw')
MARK = {m.name: m.frame for m in scene.timeline_markers}
DEFAULTS = {k: rig.id_properties_ui(k).as_dict().get("default", rig[k]) for k in rig.keys()
            if isinstance(rig[k], float)}


def static(**props):
    rig.animation_data.action = None
    for pbn in rig.pose.bones:
        pbn.rotation_quaternion = (1, 0, 0, 0)
        pbn.location = (0, 0, 0)
    for k in DEFAULTS:
        rig[k] = DEFAULTS[k]
    for k, v in props.items():
        rig[k] = v
    scene.frame_set(1)


def animated(frame):
    rig.animation_data.action = reel
    scene.frame_set(frame)


SHOTS = [
    ("01_hero", dict(), None, (3.3, -5.0, 2.5), (0, -0.1, 0.95), 50),
    ("02_front", dict(), None, (0, -5.5, 1.15), (0, 0, 1.0), 50),
    ("03_back", dict(), None, (-1.9, 3.3, 2.0), (0, 0, 1.0), 50),
    ("04_side_letters", dict(), None, (-5.2, -1.2, 1.4), (0, 0, 1.0), 50),
    ("05_lid_open", dict(lid_open=1.0, face_surprise=1.0, face_smile=0.0), None, (2.2, -4.2, 2.3), (-0.3, -0.4, 1.05), 45),
    ("06_exploded", dict(explode=1.0, back_open=1.0), None, (4.4, -4.6, 3.2), (0, -0.5, 1.1), 45),
    ("07_face_open", dict(face_open=1.0, face_smile=0.0), None, (0.4, -2.2, 1.6), (0, 0, 1.45), 60),
    ("08_inside", dict(lid_open=1.0), None, (-0.9, -2.4, 2.0), (0, 0, 0.95), 50),
    ("09_wave", None, MARK.get("Wave", 97) + 30, (3.3, -5.0, 2.5), (0, -0.1, 0.95), 50),
    ("10_walk", None, MARK.get("Walk", 170) + 30, (4.5, -3.5, 1.8), (0, -0.1, 0.8), 50),
    ("11_play", None, MARK.get("PlayGame", 560) + 46, (3.3, -5.0, 2.5), (0, -0.1, 0.95), 50),
    ("13_sit", None, MARK.get("Sit", 800) + 45, (2.9, -4.4, 1.6), (0, -0.2, 0.6), 50),
    ("14_sad", None, MARK.get("Sad", 930) + 30, (2.6, -4.6, 2.0), (0, -0.1, 0.95), 50),
    ("15_battery_open", dict(back_open=1.0), None, (-2.2, 3.0, 1.5), (0, 0.3, 0.75), 50),
    ("16_heart", dict(lid_open=1.0), None, (0.9, -1.9, 1.05), (0.2, 0.0, 0.78), 60),
    ("12_cartridge", dict(cartridge_insert=0.6, face_open=1.0, face_smile=0.0), None, (2.0, -3.0, 1.9), (0, -0.4, 1.1), 50),
]

for name, props, frame, cl, tl, lens in SHOTS:
    if only and name not in only:
        continue
    if props is not None:
        static(**props)
    else:
        animated(frame)
    cam.location = cl
    target.location = tl
    cam.data.lens = lens
    path = os.path.join(outdir, name + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if NEEDS_GAMMA:
        import numpy as np
        img = bpy.data.images.load(path, check_existing=False)
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        c = np.clip(px[:, :3], 0, 1)
        px[:, :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
        img.pixels.foreach_set(px.ravel())
        img.filepath_raw = path
        img.save()
        bpy.data.images.remove(img)
    print("RENDERED", path)
