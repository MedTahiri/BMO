"""
Export BMO for the web: GLB (meshes, skin, mouth morph targets, bone clips) + clips.json
(custom-property tracks such as lid_open / face_* that glTF cannot carry).
    ./blender.sh -b bmo.blend --python export_web.py -- [out_dir]
Nothing is saved back to bmo.blend.
"""
import bpy
import json
import os
import sys

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out_dir = os.path.abspath(args[0] if args else "web/public/models")
os.makedirs(out_dir, exist_ok=True)

scene = bpy.context.scene
rig = bpy.data.objects["BMO_Rig"]
PROP_NAMES = [k for k in rig.keys() if isinstance(rig[k], float)]
DEFAULTS = {k: rig.id_properties_ui(k).as_dict().get("default", rig[k]) for k in PROP_NAMES}


def action_fcurves(act, slot=None):
    try:
        return list(act.fcurves)
    except Exception:
        pass
    try:
        from bpy_extras import anim_utils
        if slot is None:
            slot = act.slots[0]
        cb = anim_utils.action_get_channelbag_for_slot(act, slot)
        return list(cb.fcurves) if cb else []
    except Exception:
        return []


# ---------------------------------------------------------------- 1. property tracks per clip
clips = {}
for act in bpy.data.actions:
    if not act.name.startswith("BMO_") or act.name == "BMO_Showreel":
        continue
    start, end = (int(round(v)) for v in act.frame_range)
    name = act.name[4:]
    if name == "Walk":
        end = start + 47
    tracks = {}
    for fc in action_fcurves(act):
        dp = fc.data_path
        if dp.startswith('["') and dp.endswith('"]'):
            prop = dp[2:-2]
            tracks[prop] = [round(fc.evaluate(f), 4) for f in range(start, end + 1)]
    clips[name] = {"fps": scene.render.fps, "frames": end - start + 1,
                   "loop": name in ("Idle", "Walk"), "props": tracks}

with open(os.path.join(out_dir, "clips.json"), "w") as fh:
    json.dump({"defaults": DEFAULTS, "clips": clips}, fh, separators=(",", ":"))
print("WEB: clips", list(clips))

# ---------------------------------------------------------------- 2. rest state, drivers off
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
for k, v in DEFAULTS.items():
    rig[k] = v
scene.frame_set(1)

driven = set()
for idb in list(bpy.data.objects) + list(bpy.data.shape_keys) + list(bpy.data.materials):
    ad = getattr(idb, "animation_data", None)
    if ad:
        for d in ad.drivers:
            d.mute = True
            driven.add(idb.name)
mat_lcd = bpy.data.materials.get("BMO_LCD")
if mat_lcd and mat_lcd.node_tree.animation_data:
    for d in mat_lcd.node_tree.animation_data.drivers:
        d.mute = True

# driven channels back to their neutral base
for n in ("Face_HappyEye.L", "Face_HappyEye.R", "Face_Eye.L", "Face_Eye.R", "Int_Heart"):
    o = bpy.data.objects.get(n)
    if o:
        o.scale = (1, 1, 1)
cart = bpy.data.objects.get("Acc_Cartridge_Insert")
if cart:
    cart.hide_viewport = cart.hide_render = False
    cart.hide_set(False)

# the showreel is long and uses root motion - the web plays the individual clips
reel = bpy.data.actions.get("BMO_Showreel")
if reel:
    bpy.data.actions.remove(reel)

# ---------------------------------------------------------------- 3. select what ships
SKIP_COLLS = {"Stage", "BMO_Cutters", "Cut_Faceplate", "Cut_PCB", "Cut_Shell"}
SKIP_OBJS = {"Acc_Controller", "Acc_ControllerCable", "Acc_ControllerPlug", "Acc_Cartridge_Floor",
             "Acc_Screwdriver", "Acc_SpareScrew.0", "Acc_SpareScrew.1", "Camera_Target"}
bpy.ops.object.select_all(action='DESELECT')
for lc in bpy.context.view_layer.layer_collection.children["BMO"].children:
    if lc.name == "BMO_Cutters":
        lc.exclude = True
for o in scene.objects:
    colls = {c.name for c in o.users_collection}
    if colls & SKIP_COLLS or o.name in SKIP_OBJS:
        continue
    try:
        o.hide_set(False)
        o.select_set(True)
    except RuntimeError:
        pass
bpy.context.view_layer.objects.active = rig

# lighter subdivision for the web
for o in bpy.context.selected_objects:
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.render_levels = m.levels = 1

glb = os.path.join(out_dir, "bmo_raw.glb")
kw = dict(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
          export_yup=True, export_texcoords=True, export_normals=True,
          export_materials='EXPORT', export_extras=True,
          export_skins=True, export_morph=True, export_morph_normal=False,
          export_animations=True, export_animation_mode='ACTIONS',
          export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True,
          export_anim_single_armature=True)
valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid})
print("WEB: exported", glb, os.path.getsize(glb) // 1024, "KB")
