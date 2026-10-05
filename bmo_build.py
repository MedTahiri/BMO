"""
BMO (Adventure Time) - procedural, rigged & animatable Blender model.

Run (headless):
    blender -b --factory-startup --python bmo_build.py -- --out bmo.blend
or open Blender > Scripting > open this file > Run Script (it rebuilds the scene).

Everything is generated from code: shell, removable faceplate (hinged + exploding),
PCB, LCD with an animatable face, internals (cartridge drive, heart, battery,
wires...), rigged noodle limbs with leg IK, accessories and a studio stage.
Animation is driven by custom properties on the BMO_Rig object (see README.md).
"""
import bpy
import bmesh
import math
import os
import sys
from math import radians, sin, cos, pi, sqrt
from mathutils import Vector, Matrix

# --------------------------------------------------------------------------- dimensions
W, D, H = 1.0, 0.66, 1.4          # body width (X), depth (Y), height (Z)
Z0 = 0.5                          # body bottom = leg length
ZC = Z0 + H / 2                   # body centre height
Z1 = Z0 + H
WALL = 0.045
FRONT_Y = -D / 2                  # BMO faces -Y
BACK_Y = D / 2
PLATE_T = 0.06
PCB_FRONT, PCB_BACK = -0.312, -0.292
LCD_Y = -0.287
FACE_Y = -0.2885

WIN = dict(x=0.0, z=1.56, w=0.72, h=0.50)       # screen window in faceplate
SLOT = dict(x=-0.10, z=1.19, w=0.44, h=0.038)   # cartridge slot
PORT = dict(x=0.25, z=0.60, w=0.11, h=0.05)     # controller port
SCREW_POS = [(-0.44, 1.84), (0.44, 1.84), (-0.44, 0.56), (0.44, 0.56)]
ARM_Z = 0.92
LEG_X = 0.22

# front button layout (x, z)
DPAD = (-0.24, 0.92)
TRI = (0.12, 0.985)
GREEN = (0.30, 0.965)
RED = (0.21, 0.80)
BLUE_DOT = (0.30, 1.19)
DASHES = [(-0.30, 0.66), (-0.13, 0.66)]


# --------------------------------------------------------------------------- utils
def hex_lin(h, a=1.0):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


def set_input(node, names, value):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def make_mat(name, hexcol, rough=0.45, metal=0.0, coat=0.0, emit=None, emit_str=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if out is None:
        out = nt.nodes.new('ShaderNodeOutputMaterial')
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    col = hex_lin(hexcol)
    set_input(bsdf, 'Base Color', col)
    set_input(bsdf, 'Roughness', rough)
    set_input(bsdf, 'Metallic', metal)
    set_input(bsdf, ['Specular IOR Level', 'Specular'], spec)
    if coat:
        set_input(bsdf, ['Coat Weight', 'Coat'], coat)
        set_input(bsdf, 'Coat Roughness', 0.15)
    if emit:
        set_input(bsdf, ['Emission Color', 'Emission'], hex_lin(emit))
        set_input(bsdf, 'Emission Strength', emit_str)
    m.diffuse_color = col
    m.roughness = rough
    m.metallic = metal
    return m


def lcd_material():
    """Emissive LCD with the pixel grid seen on BMO's screen."""
    m = bpy.data.materials.new("BMO_LCD")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    out = N('ShaderNodeOutputMaterial'); out.location = (900, 0)
    tc = N('ShaderNodeTexCoord'); tc.location = (-900, 0)
    sep = N('ShaderNodeSeparateXYZ'); sep.location = (-700, 0)
    nt.links.new(tc.outputs['UV'], sep.inputs[0])
    lines = []
    for i, cells in enumerate((28, 19)):
        mul = N('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = cells
        mul.location = (-500, 150 - 300 * i)
        fr = N('ShaderNodeMath'); fr.operation = 'FRACT'; fr.location = (-330, 150 - 300 * i)
        lt = N('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.07
        lt.location = (-160, 150 - 300 * i)
        nt.links.new(sep.outputs[i], mul.inputs[0])
        nt.links.new(mul.outputs[0], fr.inputs[0])
        nt.links.new(fr.outputs[0], lt.inputs[0])
        lines.append(lt)
    mx = N('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.location = (0, 0)
    nt.links.new(lines[0].outputs[0], mx.inputs[0])
    nt.links.new(lines[1].outputs[0], mx.inputs[1])
    ramp = N('ShaderNodeValToRGB'); ramp.location = (180, 0)
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].color = hex_lin('#C4F7CF')
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = hex_lin('#C4F7CF')  # plain screen (no grid), like the website
    nt.links.new(mx.outputs[0], ramp.inputs[0])
    em = N('ShaderNodeEmission'); em.name = "Emission"; em.location = (480, 100)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(ramp.outputs[0], em.inputs['Color'])
    gl = N('ShaderNodeBsdfPrincipled'); gl.location = (480, -200)
    set_input(gl, 'Base Color', (0.02, 0.03, 0.02, 1))
    set_input(gl, 'Roughness', 0.12)
    add = N('ShaderNodeAddShader'); add.location = (720, 0)
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(gl.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    m.diffuse_color = hex_lin('#C4F7CF')
    return m


def new_coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


def mesh_obj(name, bm, coll, mats=None, loc=(0, 0, 0), smooth=False):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    obj.location = loc
    for m in (mats or []):
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
    return obj


def faces_of(verts):
    return {f for v in verts for f in v.link_faces}


def set_mat_index(verts, idx):
    for f in faces_of(verts):
        f.material_index = idx


def axis_mat(axis):
    if axis == 'X':
        return Matrix.Rotation(radians(90), 4, 'Y')
    if axis == 'Y':
        return Matrix.Rotation(radians(-90), 4, 'X')
    return Matrix()


def add_box(bm, size, center=(0, 0, 0), rot=None):
    m = Matrix.Translation(center) @ (rot if rot else Matrix()) @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']


def add_cyl(bm, r, depth, center=(0, 0, 0), axis='Z', seg=32, r2=None, scale=(1, 1, 1)):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1)) @ axis_mat(axis)
    return bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                                 radius1=r, radius2=r if r2 is None else r2,
                                 depth=depth, matrix=m)['verts']


def add_sphere(bm, r, center=(0, 0, 0), scale=(1, 1, 1), seg=24):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1))
    return bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2,
                                     radius=r, matrix=m)['verts']


def add_torus(bm, R, r, center=(0, 0, 0), axis='Z', seg=40, rseg=12):
    m = Matrix.Translation(center) @ axis_mat(axis)
    rings = []
    for i in range(seg):
        a = 2 * pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * pi * j / rseg
            p = Vector(((R + r * cos(b)) * cos(a), (R + r * cos(b)) * sin(a), r * sin(b)))
            ring.append(bm.verts.new(m @ p))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            a, b = rings[i], rings[(i + 1) % seg]
            bm.faces.new((a[j], b[j], b[(j + 1) % rseg], a[(j + 1) % rseg]))
    return [v for ring in rings for v in ring]


def add_capsule(bm, p0, p1, r, seg=16, post_scale=None):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    verts = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2 + (seg // 2) % 2,
                                      radius=r)['verts']
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    for v in verts:
        c = v.co.copy()
        if c.z > 1e-6:
            c.z += L
        elif abs(c.z) <= 1e-6:
            c.z += 0.0
        v.co = p0 + rot @ c
    if post_scale:
        ctr = (p0 + p1) / 2
        for v in verts:
            v.co = ctr + Vector([(v.co[i] - ctr[i]) * post_scale[i] for i in range(3)])
    return verts


def mod_bevel(obj, width=0.02, seg=3, angle=30, harden=True):
    m = obj.modifiers.new("Bevel", 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = radians(angle)
    try:
        m.harden_normals = harden
    except Exception:
        pass
    obj.data.shade_smooth()
    return m


def weight_y_edges(bm):
    """Mark edges running along Y (front-to-back corners) for a big rounded corner bevel."""
    lay = bm.edges.layers.float.get("bevel_weight_edge") or bm.edges.layers.float.new("bevel_weight_edge")
    for e in bm.edges:
        d = (e.verts[1].co - e.verts[0].co).normalized()
        if abs(d.y) > 0.9:
            e[lay] = 1.0


def mod_corner_round(obj, width, seg=8):
    m = obj.modifiers.new("CornerRound", 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'WEIGHT'
    return m


def mod_bool(obj, coll):
    m = obj.modifiers.new("Cutouts", 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.operand_type = 'COLLECTION'
    m.collection = coll
    m.solver = 'EXACT'
    return m


def mod_subsurf(obj, lvl=1, render=2):
    m = obj.modifiers.new("Subsurf", 'SUBSURF')
    m.levels = lvl
    m.render_levels = render
    return m


def curve_obj(name, pts, coll, mat, radius=0.008, kind='BEZIER', closed=False, res=12):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new(kind)
    if kind == 'BEZIER':
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
    else:
        sp.points.add(len(pts) - 1)
        for pt, p in zip(sp.points, pts):
            pt.co = (*p, 1.0)
        if kind == 'NURBS':
            sp.use_endpoint_u = True
            sp.order_u = 4
    sp.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, cu)
    coll.objects.link(obj)
    cu.materials.append(mat)
    return obj


def text_obj(name, body, size, extrude, coll, mat, matrix, bevel=0.004):
    cu = bpy.data.curves.new(name + "_txt", 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    me.name = name
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    obj.matrix_world = matrix
    me.materials.append(mat)
    me.shade_smooth()
    return obj


def frame_matrix(xaxis, yaxis, loc):
    x, y = Vector(xaxis), Vector(yaxis)
    z = x.cross(y)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = loc
    return m


def parent_keep(child, parent):
    """Parent while keeping the world transform; child's local values stay = rest world values."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# --------------------------------------------------------------------------- scene reset
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.armatures,
                  bpy.data.actions, bpy.data.lights, bpy.data.cameras):
        for d in list(block):
            block.remove(d)


reset_scene()
scene = bpy.context.scene

C_BMO = new_coll("BMO")
C_BODY = new_coll("BMO_Body", C_BMO)
C_FACE = new_coll("BMO_Faceplate", C_BMO)
C_SCREEN = new_coll("BMO_Screen", C_BMO)
C_INT = new_coll("BMO_Internals", C_BMO)
C_LIMB = new_coll("BMO_Limbs", C_BMO)
C_RIG = new_coll("BMO_Rig", C_BMO)
C_CUT = new_coll("BMO_Cutters", C_BMO)
C_CUT_PLATE = new_coll("Cut_Faceplate", C_CUT)
C_CUT_PCB = new_coll("Cut_PCB", C_CUT)
C_ACC = new_coll("Accessories")
C_STAGE = new_coll("Stage")

# --------------------------------------------------------------------------- materials
M = {
    'body': make_mat("BMO_Teal", '#4FC9A8', rough=0.42, coat=0.2),
    'limb': make_mat("BMO_Limb", '#4FC9A8', rough=0.5),
    'dark': make_mat("BMO_Letters", '#2A1D28', rough=0.45),
    'hole': make_mat("Hole_Dark", '#0D1112', rough=0.9),
    'rubber': make_mat("Rubber_Socket", '#2B2224', rough=0.6),
    'chrome': make_mat("Chrome", '#D8DCDE', rough=0.18, metal=1.0),
    'steel': make_mat("Steel_Dark", '#5E6468', rough=0.35, metal=1.0),
    'yellow': make_mat("Btn_Yellow", '#F2C230', rough=0.3, coat=0.4),
    'cyan': make_mat("Btn_Triangle", '#3FC1E0', rough=0.3, coat=0.4),
    'green': make_mat("Btn_Green", '#42D45E', rough=0.3, coat=0.4),
    'red': make_mat("Btn_Red", '#EE3F6B', rough=0.3, coat=0.4),
    'blue': make_mat("Btn_Blue", '#2E44B0', rough=0.35, coat=0.3),
    'navy': make_mat("Btn_Dash", '#1E2C6E', rough=0.4),
    'bezel': make_mat("Screen_Block", '#D3F2EA', rough=0.45),
    'lcd': lcd_material(),
    'face': make_mat("Face_Black", '#0B0B0B', rough=0.6),
    'pcb': make_mat("PCB_Green", '#2F8F45', rough=0.35, coat=0.5),
    'trace': make_mat("PCB_Trace", '#E9E2C4', rough=0.3, metal=0.3),
    'gold': make_mat("Gold", '#E0A93A', rough=0.25, metal=1.0),
    'chip': make_mat("Chip_Black", '#161616', rough=0.45),
    'drive': make_mat("Drive_Yellow", '#E7A723', rough=0.35, metal=0.15, coat=0.3),
    'heart': make_mat("Heart_Gold", '#F3A93B', rough=0.25, metal=0.35, coat=0.6),
    'battery': make_mat("Battery_Silver", '#B9BEC2', rough=0.3, metal=0.8),
    'label': make_mat("Label_White", '#F2F0E8', rough=0.6),
    'w_red': make_mat("Wire_Red", '#D9332E', rough=0.4),
    'w_blue': make_mat("Wire_Blue", '#2F6FD6', rough=0.4),
    'w_yel': make_mat("Wire_Yellow", '#F1C82B', rough=0.4),
    'w_org': make_mat("Wire_Orange", '#F08A2C', rough=0.4),
    'w_pur': make_mat("Wire_Purple", '#8A4FD0', rough=0.4),
    'w_blk': make_mat("Wire_Black", '#1A1A1A', rough=0.5),
    'cap_blue': make_mat("Capacitor_Blue", '#2B7BD8', rough=0.3, coat=0.4),
    'paper': make_mat("Scroll_Paper", '#E8D5AE', rough=0.8),
    'ctrl': make_mat("Controller_Navy", '#22355E', rough=0.4, coat=0.3),
    'cart': make_mat("Cartridge_Grey", '#A7A9AE', rough=0.5),
    'cart_lbl': make_mat("Cartridge_Label", '#EA5B8B', rough=0.5),
    'handle': make_mat("Screwdriver_Red", '#C8202A', rough=0.25, coat=0.6),
    'leg': make_mat("BMO_Leg_DarkTeal", '#1F9A7A', rough=0.5),
    'heart_y': make_mat("Heart_Yellow", '#F2C933', rough=0.55),
    'heart_line': make_mat("Heart_Face_Line", '#9C7A12', rough=0.6),
    'aa_orange': make_mat("AA_Orange", '#E8873A', rough=0.45),
    'aa_black': make_mat("AA_Black", '#222326', rough=0.4),
    'mustard': make_mat("Int_Mustard", '#D2AE36', rough=0.5),
    'heart_m': make_mat("Int_Heart_Mustard", '#C8A632', rough=0.55),
    'grey': make_mat("Int_LightGrey", '#C9CDD0', rough=0.55),
    'tray': make_mat("Int_Tray", '#DADDDF', rough=0.6),
    'sock_g': make_mat("Int_Socket_Green", '#1E4A3C', rough=0.5),
    'post': make_mat("Int_CornerPost", '#23282B', rough=0.5),
    't_green': make_mat("Tube_Green", '#22CF78', rough=0.35, coat=0.3),
    't_pink': make_mat("Tube_Magenta", '#E52E6F', rough=0.35, coat=0.3),
    't_blue': make_mat("Tube_Blue", '#2F79E3', rough=0.35, coat=0.3),
    'led_c': make_mat("LED_Cyan", '#7FF0FF', rough=0.2, emit='#7FF0FF', emit_str=3.0),
    'led_r': make_mat("LED_Red", '#FF3030', rough=0.2, emit='#FF3030', emit_str=3.0),
    'floor': make_mat("Stage_Backdrop", '#C98A62', rough=0.85, spec=0.2),
}

# --------------------------------------------------------------------------- rig
arm_data = bpy.data.armatures.new("BMO_Rig")
rig = bpy.data.objects.new("BMO_Rig", arm_data)
C_RIG.objects.link(rig)
arm_data.display_type = 'OCTAHEDRAL'
rig.show_in_front = True
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, connect=False, deform=True):
    b = eb.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.use_deform = deform
    return b


bone("root", (0, 0, 0), (0, 0.6, 0), deform=False)
bone("body", (0, 0, Z0), (0, 0, ZC + 0.3), "root", deform=False)

ARM_J, LEG_J, FOOT_J = {}, {}, {}
for s, sfx in ((1, "L"), (-1, "R")):
    J = [Vector((s * 0.50, 0, ARM_Z)), Vector((s * 0.635, 0, 0.84)),
         Vector((s * 0.68, -0.01, 0.60)), Vector((s * 0.69, -0.02, 0.50))]
    ARM_J[sfx] = J
    bone(f"arm_upper.{sfx}", J[0], J[1], "body")
    bone(f"arm_lower.{sfx}", J[1], J[2], f"arm_upper.{sfx}", True)
    bone(f"hand.{sfx}", J[2], J[3], f"arm_lower.{sfx}", True)
    LJ = [Vector((s * LEG_X, 0, Z0)), Vector((s * LEG_X, -0.03, 0.29)), Vector((s * LEG_X, 0, 0.068))]
    LEG_J[sfx] = LJ
    FOOT_J[sfx] = (LJ[2], Vector((s * LEG_X, -0.17, 0.068)))
    bone(f"thigh.{sfx}", LJ[0], LJ[1], "body")
    bone(f"shin.{sfx}", LJ[1], LJ[2], f"thigh.{sfx}", True)
    bone(f"foot.{sfx}", FOOT_J[sfx][0], FOOT_J[sfx][1], f"shin.{sfx}", True)
    bone(f"foot_ik.{sfx}", FOOT_J[sfx][0], FOOT_J[sfx][1], "root", deform=False)
    bone(f"knee_pole.{sfx}", (s * LEG_X, -0.7, 0.28), (s * LEG_X, -0.8, 0.28), "root", deform=False)


def signed_angle(u, v, n):
    a = u.angle(v)
    return -a if u.cross(v).dot(n) < 0 else a


POLE_ANGLE = {}
for sfx in ("L", "R"):
    base, ikb, pole = eb[f"thigh.{sfx}"], eb[f"shin.{sfx}"], eb[f"knee_pole.{sfx}"]
    pn = (ikb.tail - base.head).cross(pole.head - base.head)
    proj = pn.cross(base.tail - base.head)
    POLE_ANGLE[sfx] = signed_angle(base.x_axis, proj, base.tail - base.head)

bpy.ops.object.mode_set(mode='OBJECT')

for sfx in ("L", "R"):
    pb = rig.pose.bones[f"shin.{sfx}"]
    ik = pb.constraints.new('IK')
    ik.target, ik.subtarget = rig, f"foot_ik.{sfx}"
    ik.pole_target, ik.pole_subtarget = rig, f"knee_pole.{sfx}"
    ik.pole_angle = POLE_ANGLE[sfx]
    ik.chain_count = 2
    cr = rig.pose.bones[f"foot.{sfx}"].constraints.new('COPY_ROTATION')
    cr.target, cr.subtarget = rig, f"foot_ik.{sfx}"

# bone collections for a tidy rig UI
try:
    bc_main = arm_data.collections.new("Controls")
    bc_def = arm_data.collections.new("Deform")
    for b in arm_data.bones:
        (bc_def if b.use_deform else bc_main).assign(b)
except Exception:
    pass

# animation control properties (all keyframable)
PROPS = {
    "lid_open": (0.0, 0.0, 1.0, "Swing the faceplate open on its hinge"),
    "explode": (0.0, 0.0, 1.0, "Exploded view: faceplate, PCB, screws, screen fly apart"),
    "back_open": (0.0, 0.0, 1.0, "Pop the rear battery door off"),
    "screen_on": (1.0, 0.0, 3.0, "LCD brightness"),
    "face_smile": (1.0, 0.0, 1.0, "Mouth: smile"),
    "face_open": (0.0, 0.0, 1.0, "Mouth: big open grin / talking"),
    "face_frown": (0.0, 0.0, 1.0, "Mouth: frown"),
    "face_surprise": (0.0, 0.0, 1.0, "Mouth: 'O' surprise"),
    "blink": (0.0, 0.0, 1.0, "Eyelids closed"),
    "eye_look_x": (0.0, -1.0, 1.0, "Eyes look left/right"),
    "eye_look_z": (0.0, -1.0, 1.0, "Eyes look down/up"),
    "eyes_happy": (0.0, 0.0, 1.0, "Eyes become happy ^ ^ arcs"),
    "cartridge_insert": (0.0, 0.0, 1.0, "Insert a game cartridge into the slot (0 = hidden)"),
}
for k, (dv, lo, hi, desc) in PROPS.items():
    rig[k] = dv
    rig.id_properties_ui(k).update(default=dv, min=lo, max=hi, soft_min=lo, soft_max=hi, description=desc)

# body root (everything rigid on the body hangs from here)
body_root = bpy.data.objects.new("BMO_BodyRoot", None)
body_root.empty_display_type = 'PLAIN_AXES'
body_root.empty_display_size = 0.2
C_RIG.objects.link(body_root)
body_root.parent = rig
body_root.parent_type = 'BONE'
body_root.parent_bone = "body"
bpy.context.view_layer.update()
body_root.matrix_parent_inverse = body_root.matrix_world.inverted()

DRIVERS = []


def drive(target_id, path, index, expr, prop=None):
    fc = target_id.driver_add(path, index) if index is not None and index >= 0 else target_id.driver_add(path)
    drv = fc.driver
    drv.type = 'SCRIPTED'
    if prop:
        v = drv.variables.new()
        v.name = 'var'
        v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'OBJECT'
        v.targets[0].id = rig
        v.targets[0].data_path = f'["{prop}"]'
    drv.expression = expr
    for mod in list(fc.modifiers):
        fc.modifiers.remove(mod)
    DRIVERS.append((target_id, path, drv))
    return fc


# --------------------------------------------------------------------------- shell
bm = bmesh.new()
add_box(bm, (W, D, H), (0, 0, ZC))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.y < -0.9], context='FACES_ONLY')
shell = mesh_obj("BMO_Shell", bm, C_BODY, [M['body']])
BODY_R = 0.09                       # rounded body corners (like the printed figure)
rb = shell.modifiers.new("BodyCurve", 'BEVEL')
rb.width = BODY_R
rb.segments = 8
rb.limit_method = 'ANGLE'
sol = shell.modifiers.new("Wall", 'SOLIDIFY')
sol.thickness = WALL
sol.offset = -1
sol.use_even_offset = True
mod_bevel(shell, 0.012, 3, 30)
C_CUT_SHELL = new_coll("Cut_Shell", C_CUT)
mod_bool(shell, C_CUT_SHELL)

# screw bosses inside the shell corners
bm = bmesh.new()
for x, z in SCREW_POS:
    add_cyl(bm, 0.024, 0.5, (x, -0.04, z), 'Y', 20)
    add_cyl(bm, 0.009, 0.51, (x, -0.04, z), 'Y', 12)
mesh_obj("BMO_ScrewBosses", bm, C_BODY, [M['post']], smooth=True)

# speaker holes (7-dot hexagon) on BMO's right side (-X)
bm = bmesh.new()
cy, cz = 0.0, 1.66
for i in range(7):
    if i == 0:
        y, z = cy, cz
    else:
        a = radians(60 * i + 30)
        y, z = cy + 0.09 * cos(a), cz + 0.09 * sin(a)
    add_cyl(bm, 0.022, 0.02, (-W / 2 + 0.008, y, z), 'X', 20)
mesh_obj("BMO_SpeakerHoles", bm, C_BODY, [M['hole']], smooth=True)

# raised "BM" letters (the arm socket forms the "O")
letters = text_obj("BMO_Letters", "BM", 0.27, 0.012, C_BODY, M['dark'],
                   frame_matrix((0, 0, -1), (0, -1, 0), (-W / 2 - 0.006, 0.0, 1.24)))

# back vents + battery door outline slot
bm = bmesh.new()
for x in (-0.28, -0.14, 0.0, 0.14, 0.28):
    add_capsule(bm, (x, BACK_Y, 1.38), (x, BACK_Y, 1.76), 0.024, 12, post_scale=(1, 0.35, 1))
mesh_obj("BMO_BackVents", bm, C_BODY, [M['hole']], smooth=True)

# sockets (rubber grommets with a chrome ring) where limbs enter
SOCKETS = []
bm = bmesh.new()
for s in (1, -1):
    add_torus(bm, 0.07, 0.02, (s * (W / 2 + 0.004), 0, ARM_Z), 'X')
    add_cyl(bm, 0.072, 0.012, (s * (W / 2 - 0.002), 0, ARM_Z), 'X', 32)
    add_torus(bm, 0.072, 0.02, (s * LEG_X, 0, Z0 - 0.004), 'Z')
    add_cyl(bm, 0.074, 0.012, (s * LEG_X, 0, Z0 + 0.002), 'Z', 32)
sock = mesh_obj("BMO_Sockets", bm, C_BODY, [M['rubber']], smooth=True)
bm = bmesh.new()
for s in (1, -1):
    add_torus(bm, 0.094, 0.006, (s * (W / 2 + 0.002), 0, ARM_Z), 'X', 40, 8)
    add_torus(bm, 0.096, 0.006, (s * LEG_X, 0, Z0 - 0.002), 'Z', 40, 8)
mesh_obj("BMO_SocketRings", bm, C_BODY, [M['chrome']], smooth=True)


# --------------------------------------------------------------------------- screws
def make_screw(name, coll, length=0.1):
    """Screw along +Y: head at y=0 (facing -Y), shaft going +Y. Two materials."""
    bm = bmesh.new()
    head = add_cyl(bm, 0.022, 0.01, (0, 0.005, 0), 'Y', 24)
    dome = add_sphere(bm, 0.022, (0, 0.0, 0), (1, 0.25, 1), 24)
    shaft = add_cyl(bm, 0.0075, length, (0, length / 2 + 0.01, 0), 'Y', 12)
    tip = add_cyl(bm, 0.0075, 0.012, (0, length + 0.016, 0), 'Y', 12, r2=0.001)
    for i in range(int(length / 0.009)):
        add_torus(bm, 0.0085, 0.0022, (0, 0.02 + i * 0.009, 0), 'Y', 12, 6)
    slot = add_box(bm, (0.03, 0.01, 0.006), (0, -0.004, 0))
    slot += add_box(bm, (0.006, 0.01, 0.03), (0, -0.004, 0))
    set_mat_index(slot, 1)
    return mesh_obj(name, bm, coll, [M['chrome'], M['hole']], smooth=True)


# --------------------------------------------------------------------------- faceplate (hinged at -X edge)
bm = bmesh.new()
add_box(bm, (W, PLATE_T, H), (W / 2, -PLATE_T / 2, 0))
weight_y_edges(bm)
plate = mesh_obj("BMO_Faceplate", bm, C_FACE, [M['body']], loc=(-W / 2, FRONT_Y, ZC))
mod_corner_round(plate, BODY_R)
mod_bevel(plate, 0.02, 4, 30)
mod_bool(plate, C_CUT_PLATE)

PLATE_FRONT = FRONT_Y - PLATE_T
cutters_plate = []


def cutter(name, coll, size, center, bevel=0.0, cyl=None):
    bm = bmesh.new()
    if cyl:
        add_cyl(bm, cyl[0], cyl[1], center, 'Y', 32)
    else:
        add_box(bm, size, center)
    o = mesh_obj(name, bm, coll)
    o.display_type = 'WIRE'
    o.hide_render = True
    if bevel:
        b = o.modifiers.new("Round", 'BEVEL')
        b.width = bevel
        b.segments = 6
    return o


cutters_plate.append(cutter("cut_window", C_CUT_PLATE, (WIN['w'], 0.3, WIN['h']), (WIN['x'], FRONT_Y, WIN['z']), 0.045))
cutters_plate.append(cutter("cut_slot", C_CUT_PLATE, (SLOT['w'], 0.3, SLOT['h']), (SLOT['x'], FRONT_Y, SLOT['z']), 0.012))
cutters_plate.append(cutter("cut_port", C_CUT_PLATE, (PORT['w'], 0.3, PORT['h']), (PORT['x'], FRONT_Y, PORT['z']), 0.01))
for i, (x, z) in enumerate(SCREW_POS):
    cutters_plate.append(cutter(f"cut_screw_cs{i}", C_CUT_PLATE, None, (x, PLATE_FRONT, z), cyl=(0.026, 0.024)))
    cutters_plate.append(cutter(f"cut_screw_hole{i}", C_CUT_PLATE, None, (x, FRONT_Y, z), cyl=(0.0095, 0.3)))

# buttons
plate_children = []
bm = bmesh.new()
add_box(bm, (0.2, 0.05, 0.066), (DPAD[0], PLATE_FRONT, DPAD[1]))
add_box(bm, (0.066, 0.05, 0.2), (DPAD[0], PLATE_FRONT, DPAD[1]))
dpad = mesh_obj("Btn_DPad", bm, C_FACE, [M['yellow']])
mod_bevel(dpad, 0.012, 3, 30)
b = bmesh.new()
add_cyl(b, 0.05, 0.05, (TRI[0], PLATE_FRONT, TRI[1]), 'Y', 3)
tri = mesh_obj("Btn_Triangle", b, C_FACE, [M['cyan']])
mod_bevel(tri, 0.008, 3, 30)
for name, pos, r, mat, depth in (("Btn_Green", GREEN, 0.042, 'green', 0.05), ("Btn_Red", RED, 0.072, 'red', 0.055),
                                 ("Btn_BlueDot", BLUE_DOT, 0.026, 'blue', 0.03)):
    b = bmesh.new()
    add_cyl(b, r, depth, (pos[0], PLATE_FRONT, pos[1]), 'Y', 40)
    o = mesh_obj(name, b, C_FACE, [M[mat]])
    mod_bevel(o, min(0.012, r * 0.3), 4, 30)
    plate_children.append(o)
b = bmesh.new()
for x, z in DASHES:
    add_capsule(b, (x - 0.04, PLATE_FRONT, z), (x + 0.04, PLATE_FRONT, z), 0.018, 16, post_scale=(1, 0.9, 1))
dash = mesh_obj("Btn_Dashes", b, C_FACE, [M['navy']], smooth=True)
plate_children += [dpad, tri, dash]
# the triangle cone points up by default along local axes: rotate its verts so a vertex points up
for v in tri.data.vertices:
    p = Vector(v.co) - Vector((TRI[0], PLATE_FRONT, TRI[1]))
    p = Matrix.Rotation(radians(180), 3, 'Y') @ p
    v.co = p + Vector((TRI[0], PLATE_FRONT, TRI[1]))

# port interior (dark) + slot interior
b = bmesh.new()
add_box(b, (PORT['w'] - 0.01, 0.02, PORT['h'] - 0.01), (PORT['x'], FRONT_Y - 0.012, PORT['z']))
for i in range(4):
    add_box(b, (0.008, 0.024, 0.008), (PORT['x'] - 0.03 + i * 0.02, FRONT_Y - 0.02, PORT['z']))
port_in = mesh_obj("BMO_PortInner", b, C_FACE, [M['hole']])
plate_children.append(port_in)

front_screws = []
for i, (x, z) in enumerate(SCREW_POS):
    sc = make_screw(f"Screw_Front.{i}", C_FACE)
    sc.location = (x, PLATE_FRONT + 0.006, z)
    front_screws.append(sc)

# --------------------------------------------------------------------------- PCB (attached behind the faceplate)
bm = bmesh.new()
pcb_y = (PCB_FRONT + PCB_BACK) / 2
add_box(bm, (W - 0.11, PCB_BACK - PCB_FRONT, H - 0.11), (0, 0, 0))
weight_y_edges(bm)
pcb = mesh_obj("BMO_PCB", bm, C_FACE, [M['pcb']], loc=(0, pcb_y, ZC))
mod_corner_round(pcb, 0.06, 6)
mod_bevel(pcb, 0.004, 2, 30)
mod_bool(pcb, C_CUT_PCB)
cutters_pcb = [
    cutter("cutp_window", C_CUT_PCB, (WIN['w'] + 0.03, 0.2, WIN['h'] + 0.03), (WIN['x'], pcb_y, WIN['z']), 0.05),
    cutter("cutp_slot", C_CUT_PCB, (SLOT['w'] + 0.02, 0.2, SLOT['h'] + 0.02), (SLOT['x'], pcb_y, SLOT['z']), 0.01),
    cutter("cutp_port", C_CUT_PCB, (PORT['w'] + 0.02, 0.2, PORT['h'] + 0.02), (PORT['x'], pcb_y, PORT['z']), 0.01),
]
for i, (x, z) in enumerate(SCREW_POS):
    cutters_pcb.append(cutter(f"cutp_screw{i}", C_CUT_PCB, None, (x, pcb_y, z), cyl=(0.013, 0.2)))

pcb_children = []
PF = PCB_FRONT
# contact pads & speaker discs (front side facing the faceplate)
b = bmesh.new()
pads = add_cyl(b, 0.115, 0.003, (DPAD[0], PF, DPAD[1]), 'Y', 48)
for dx, dz in ((0.06, 0), (-0.06, 0), (0, 0.06), (0, -0.06)):
    add_cyl(b, 0.026, 0.006, (DPAD[0] + dx, PF - 0.002, DPAD[1] + dz), 'Y', 24)
for pos, r in ((RED, 0.09), (GREEN, 0.055), (TRI, 0.05), (BLUE_DOT, 0.035)):
    add_cyl(b, r, 0.003, (pos[0], PF, pos[1]), 'Y', 40)
    add_cyl(b, r * 0.62, 0.008, (pos[0], PF - 0.002, pos[1]), 'Y', 32)
for x, z in DASHES:
    add_box(b, (0.11, 0.004, 0.045), (x, PF, z))
pcb_pads = mesh_obj("PCB_Contacts", b, C_FACE, [M['chip']], smooth=True)
pcb_children.append(pcb_pads)

# chips / ICs / headers / capacitors
b = bmesh.new()
CHIPS = [((0.0, 0.79), (0.09, 0.07)), ((0.02, 1.07), (0.12, 0.05)), ((-0.41, 0.78), (0.04, 0.14)),
         ((0.41, 1.06), (0.04, 0.16)), ((-0.05, 0.58), (0.16, 0.035)), ((0.40, 0.74), (0.05, 0.06)),
         ((-0.41, 1.07), (0.04, 0.09)), ((-0.25, 1.235), (0.12, 0.025)), ((0.15, 1.235), (0.08, 0.025))]
for (x, z), (w, h) in CHIPS:
    add_box(b, (w, 0.008, h), (x, PF - 0.004, z))
    # legs
    n = max(2, int(w / 0.012))
    for i in range(n):
        xx = x - w / 2 + (i + 0.5) * w / n
        add_box(b, (0.004, 0.003, 0.012), (xx, PF - 0.0015, z + h / 2 + 0.004))
        add_box(b, (0.004, 0.003, 0.012), (xx, PF - 0.0015, z - h / 2 - 0.004))
for x0, n in ((-0.38, 14), (0.18, 8)):          # pin headers along the top
    add_box(b, (n * 0.018, 0.01, 0.02), (x0 + n * 0.009, PF - 0.005, ZC + 0.62))
for x in (-0.31, -0.29, -0.27):
    add_cyl(b, 0.007, 0.012, (x, PF - 0.006, 1.86 - 0.03), 'Y', 12)
pcb_chips = mesh_obj("PCB_Chips", b, C_FACE, [M['chip']])
pcb_children.append(pcb_chips)

b = bmesh.new()
for x0, n in ((-0.38, 14), (0.18, 8)):
    for i in range(n):
        add_box(b, (0.005, 0.014, 0.005), (x0 + 0.009 + i * 0.018, PF - 0.012, ZC + 0.62))
for (x, z) in ((0.12, 0.66), (0.40, 0.88), (-0.13, 0.80)):
    add_cyl(b, 0.016, 0.02, (x, PF - 0.01, z), 'Y', 20)
pcb_metal = mesh_obj("PCB_Metal", b, C_FACE, [M['gold']], smooth=True)
pcb_children.append(pcb_metal)

# traces (thin raised lines)
TRACES = [
    [(-0.24, 1.035), (-0.24, 1.10), (-0.30, 1.15), (-0.43, 1.15), (-0.43, 1.80)],
    [(-0.355, 0.92), (-0.39, 0.92), (-0.39, 0.86)],
    [(-0.24, 0.805), (-0.24, 0.74), (-0.17, 0.70), (-0.05, 0.70), (-0.0, 0.75)],
    [(0.21, 0.89), (0.21, 0.95), (0.16, 1.0), (0.16, 1.07), (0.08, 1.07)],
    [(0.30, 0.91), (0.36, 0.86), (0.36, 0.78)],
    [(0.12, 0.94), (0.06, 0.88), (0.04, 0.82)],
    [(0.30, 1.155), (0.30, 1.10), (0.39, 1.06)],
    [(0.43, 1.15), (0.43, 1.80)],
    [(0.37, 1.84), (0.39, 1.82), (0.43, 1.82)],
    [(-0.05, 0.60), (0.05, 0.60), (0.12, 0.64)],
    [(0.30, 0.74), (0.37, 0.70), (0.40, 0.70)],
    [(-0.13, 0.78), (-0.13, 0.72)],
]
for i, tr in enumerate(TRACES):
    o = curve_obj(f"PCB_Trace.{i:02d}", [(x, PF - 0.0005, z) for x, z in tr], C_FACE, M['trace'], 0.0028, 'POLY')
    pcb_children.append(o)

# --------------------------------------------------------------------------- screen module (LCD + face)
b = bmesh.new()
add_box(b, (0.82, 0.32, 0.60), (0, LCD_Y + 0.16, WIN['z']))
screen = mesh_obj("BMO_ScreenModule", b, C_SCREEN, [M['bezel']])
mod_bevel(screen, 0.035, 5, 30)
b = bmesh.new()
uvl = b.loops.layers.uv.new("UVMap")
quad = [b.verts.new((x * 0.37, LCD_Y - 0.0005, WIN['z'] + z * 0.258)) for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
fq = b.faces.new(quad)
for loop, uvc in zip(fq.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    loop[uvl].uv = uvc
lcd = mesh_obj("BMO_LCD", b, C_SCREEN, [M['lcd']])

EYE_Z = 1.625
eyes = []
for s, sfx in ((1, "L"), (-1, "R")):
    b = bmesh.new()
    add_cyl(b, 1.0, 0.0025, (0, 0, 0), 'Y', 32, scale=(0.026, 1, 0.032))
    e = mesh_obj(f"Face_Eye.{sfx}", b, C_SCREEN, [M['face']], loc=(s * 0.19, FACE_Y, EYE_Z))
    eyes.append(e)
happy_eyes = []
for s, sfx in ((1, "L"), (-1, "R")):
    pts = [(0.032 * cos(a), 0.0, -0.012 + 0.03 * sin(a)) for a in [radians(d) for d in range(15, 170, 25)]]
    he = curve_obj(f"Face_HappyEye.{sfx}", pts, C_SCREEN, M['face'], 0.0065)
    he.location = (s * 0.19, FACE_Y - 0.0005, EYE_Z)
    he.data.bevel_resolution = 2
    happy_eyes.append(he)

# mouth with shape keys (same topology for every expression)
MOUTH_Z = 1.475
NM = 32
TH = 0.012


def mouth_shape(kind):
    up, lo = [], []
    for i in range(NM):
        t = -1 + 2 * i / (NM - 1)
        hw = 0.11
        x = t * hw
        if kind == 'neutral':
            c, u, l = 0.0, TH / 2, -TH / 2
            up.append((x, c + u)); lo.append((x, c + l)); continue
        if kind == 'smile':
            c = -0.035 * (1 - t * t)
            taper = 0.5 + 0.5 * (1 - t * t)
            up.append((x, c + TH / 2 * taper)); lo.append((x, c - TH / 2 * taper)); continue
        if kind == 'frown':
            c = 0.03 * (1 - t * t) - 0.01
            taper = 0.5 + 0.5 * (1 - t * t)
            up.append((x, c + TH / 2 * taper)); lo.append((x, c - TH / 2 * taper)); continue
        if kind == 'open':
            x = t * 0.095
            k = sqrt(max(0.0, 1 - t * t))
            up.append((x, 0.018 + 0.006 * (1 - t * t)))
            lo.append((x, 0.018 - 0.085 * k ** 0.8))
            continue
        if kind == 'surprise':
            x = t * 0.04
            k = sqrt(max(0.0, 1 - t * t))
            up.append((x, 0.045 * k)); lo.append((x, -0.045 * k))
            continue
    return up, lo


b = bmesh.new()
up, lo = mouth_shape('neutral')
vu = [b.verts.new((x, 0, z)) for x, z in up]
vl = [b.verts.new((x, 0, z)) for x, z in lo]
for i in range(NM - 1):
    b.faces.new((vl[i], vl[i + 1], vu[i + 1], vu[i]))
mouth = mesh_obj("Face_Mouth", b, C_SCREEN, [M['face']], loc=(0, FACE_Y, MOUTH_Z))
mouth.shape_key_add(name="Basis")
for key in ("smile", "open", "frown", "surprise"):
    sk = mouth.shape_key_add(name=key.capitalize())
    up, lo = mouth_shape(key)
    for i, (x, z) in enumerate(up):
        sk.data[i].co = (x, 0, z)
    for i, (x, z) in enumerate(lo):
        sk.data[NM + i].co = (x, 0, z)

# --------------------------------------------------------------------------- internals
# Layout follows the stylised Sketchfab reference: chunky mustard block under the screen,
# arched rainbow tubes, a grey power block with sockets, a puffy heart and an AA battery bay.
int_objs = []
IY0, IY1 = -0.28, 0.27            # usable interior depth (behind the PCB)


def block(name, size, center, mat, bevel=0.02, seg=4):
    b = bmesh.new()
    add_box(b, size, center)
    o = mesh_obj(name, b, C_INT, [mat])
    mod_bevel(o, bevel, seg, 30)
    int_objs.append(o)
    return o


# mustard base under the screen + stepped front (cartridge reader)
block("Int_MustardBase", (0.86, 0.36, 0.30), (0, 0.08, 1.11), M['mustard'], 0.03)
block("Int_MustardStep1", (0.56, 0.20, 0.26), (-0.14, -0.17, 1.12), M['mustard'], 0.025)
block("Int_MustardStep2", (0.34, 0.10, 0.15), (-0.25, -0.215, 1.03), M['mustard'], 0.02)
block("Int_MustardStep3", (0.16, 0.12, 0.09), (-0.33, -0.20, 0.925), M['mustard'], 0.015)
b = bmesh.new()
add_box(b, (SLOT['w'], 0.02, SLOT['h']), (SLOT['x'], -0.268, SLOT['z']))
for i in range(4):                                     # panel grooves
    add_box(b, (0.30, 0.006, 0.008), (-0.25, -0.266, 1.0 + i * 0.03))
drive_slot = mesh_obj("Int_DriveSlot", b, C_INT, [M['hole']])
int_objs.append(drive_slot)
b = bmesh.new()
add_sphere(b, 0.016, (0.02, -0.272, 1.075), (1, 0.6, 1), 16)
led_r = mesh_obj("Int_LED_Red", b, C_INT, [M['led_r']], smooth=True)
b = bmesh.new()
add_sphere(b, 0.016, (0.08, -0.272, 1.075), (1, 0.6, 1), 16)
led_c = mesh_obj("Int_LED_Cyan", b, C_INT, [M['led_c']], smooth=True)
int_objs += [led_r, led_c]

# grey power block with dark sockets (lower left)
block("Int_PowerBlock", (0.30, 0.35, 0.30), (-0.29, -0.095, 0.70), M['grey'], 0.025)
block("Int_PowerBlockTop", (0.20, 0.18, 0.06), (-0.31, -0.17, 0.87), M['grey'], 0.015)
b = bmesh.new()
for x, z, w, h in ((-0.36, 0.79, 0.07, 0.06), (-0.24, 0.79, 0.07, 0.06), (-0.30, 0.66, 0.12, 0.05)):
    add_box(b, (w, 0.02, h), (x, -0.272, z))
add_box(b, (0.06, 0.02, 0.05), (-0.33, -0.17, 0.9))
sockets = mesh_obj("Int_PowerSockets", b, C_INT, [M['sock_g']])
mod_bevel(sockets, 0.006, 2, 30)
b = bmesh.new()
for x, z in ((-0.36, 0.79), (-0.24, 0.79)):
    for dx in (-0.014, 0.014):
        add_box(b, (0.007, 0.022, 0.022), (x + dx, -0.276, z))
pins = mesh_obj("Int_SocketPins", b, C_INT, [M['chip']])
int_objs += [sockets, pins]

# BMO's heart: puffy metaball heart (like the printed figure) with a sculpted sleepy face + medal
HEART_C = Vector((0.25, 0.03, 0.775))


def heart_f(p):
    """Classic implicit 3D heart: negative inside."""
    x, y, z = p
    q = x * x + 2.25 * y * y + z * z - 1
    return q * q * q - x * x * z ** 3 - 0.1125 * y * y * z ** 3


hb_ = bmesh.new()
bmesh.ops.create_uvsphere(hb_, u_segments=72, v_segments=40, radius=1.0)
HS = 0.14                                   # heart scale (≈0.32 wide)
for v in hb_.verts:
    d = v.co.normalized()
    r = 0.0
    while r < 2.0 and heart_f(d * (r + 0.02)) < 0:
        r += 0.02
    lo, hi = r, r + 0.02
    for _ in range(20):
        mid = (lo + hi) / 2
        if heart_f(d * mid) < 0:
            lo = mid
        else:
            hi = mid
    c = d * lo
    v.co = Vector((c.x * HS, c.y * HS * 0.85, (c.z - 0.12) * HS))
hme = bpy.data.meshes.new("Int_Heart")
hb_.to_mesh(hme)
hb_.free()
heart = bpy.data.objects.new("Int_Heart", hme)
C_INT.objects.link(heart)
hme.materials.append(M['heart_y'])
hme.shade_smooth()
heart.location = HEART_C
heart.rotation_euler = (radians(-6), 0, radians(-8))
int_objs.append(heart)
bpy.context.view_layer.update()


def on_heart(x, z, lift=0.002):
    ok, loc, nrm, _ = heart.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
    if not ok:
        loc, nrm = Vector((x, -0.06, z)), Vector((0, -1, 0))
    return heart.matrix_world @ (loc + nrm * lift)


heart_face = []
for s in (1, -1):        # closed sleepy eyes
    pts = [on_heart(s * 0.06 + 0.03 * cos(a), 0.035 + 0.012 * sin(a)) for a in
           [radians(d) for d in range(200, 341, 20)]]
    o = curve_obj(f"Int_HeartEye.{'L' if s > 0 else 'R'}", pts, C_INT, M['heart_line'], 0.0042)
    heart_face.append(o)
mp = [on_heart(x, z) for x, z in ((-0.034, -0.012), (-0.02, -0.03), (0.0, -0.018), (0.02, -0.03), (0.034, -0.012))]
heart_face.append(curve_obj("Int_HeartMouth", mp, C_INT, M['heart_line'], 0.0042))
b = bmesh.new()
MD = on_heart(0.06, -0.075, 0.012)
add_box(b, (0.07, 0.014, 0.022), MD)
add_torus(b, 0.012, 0.0035, MD + Vector((0, -0.002, -0.03)), 'Y', 20, 8)
add_cyl(b, 0.026, 0.01, MD + Vector((0, -0.004, -0.068)), 'Y', 28)
add_torus(b, 0.026, 0.004, MD + Vector((0, -0.008, -0.068)), 'Y', 28, 8)
medal = mesh_obj("Int_HeartMedal", b, C_INT, [M['gold']], smooth=True)
heart_face.append(medal)

# tiny gold hourglass with a pink gem
b = bmesh.new()
HG = Vector((0.03, -0.20, 0.62))
add_cyl(b, 0.026, 0.04, HG + Vector((0, 0, 0.021)), 'Z', 16, r2=0.004)
add_cyl(b, 0.004, 0.04, HG + Vector((0, 0, -0.019)), 'Z', 16, r2=0.026)
add_cyl(b, 0.032, 0.008, HG + Vector((0, 0, 0.044)), 'Z', 20)
add_cyl(b, 0.032, 0.008, HG + Vector((0, 0, -0.044)), 'Z', 20)
hourglass = mesh_obj("Int_Hourglass", b, C_INT, [M['gold']], smooth=True)
b = bmesh.new()
add_sphere(b, 0.014, HG + Vector((0, 0, 0.056)), (1, 1, 0.8), 12)
gem = mesh_obj("Int_HourglassGem", b, C_INT, [M['t_pink']], smooth=True)
int_objs += [hourglass, gem]


# thick arched rainbow tubes
def tube_arch(name, p0, top, p1, mat, r=0.024):
    p0, top, p1 = Vector(p0), Vector(top), Vector(p1)
    pts = [p0, p0.lerp(top, 0.5) + Vector((0, 0, 0.06)), top, p1.lerp(top, 0.5) + Vector((0, 0, 0.06)), p1]
    o = curve_obj(name, pts, C_INT, mat, r, res=16)
    int_objs.append(o)
    return o


# bundle 1: from the power block, arching over into the tray (front-centre)
for i, mk in enumerate(('t_green', 't_pink', 't_blue')):
    dy = -0.2 + i * 0.055
    tube_arch(f"Int_Tube_A.{i}", (-0.13, dy, 0.74), (-0.02 + i * 0.02, dy - 0.01, 0.90),
              (0.09 + i * 0.03, dy + 0.02, 0.66), M[mk])
ribbon = []

# --------------------------------------------------------------------------- battery compartment
BAT = dict(x=0.0, z=0.77, w=0.44, h=0.30, d=0.17)     # opening in the back wall
bay_cutter = cutter("cut_battery_bay", C_CUT_SHELL, (BAT['w'], 0.12, BAT['h']), (0, BACK_Y - 0.02, BAT['z']), 0.02)
b = bmesh.new()
bx0, bx1 = -BAT['w'] / 2 - 0.02, BAT['w'] / 2 + 0.02
y0, y1 = BACK_Y - WALL - BAT['d'], BACK_Y - WALL + 0.002
zc, hh = BAT['z'], BAT['h'] / 2 + 0.02
add_box(b, (bx1 - bx0, 0.02, 2 * hh), (0, y0, zc))                       # floor of the bay
add_box(b, (0.02, y1 - y0, 2 * hh), (bx0, (y0 + y1) / 2, zc))            # side walls
add_box(b, (0.02, y1 - y0, 2 * hh), (bx1, (y0 + y1) / 2, zc))
add_box(b, (bx1 - bx0, y1 - y0, 0.02), (0, (y0 + y1) / 2, zc + hh))      # top / bottom
add_box(b, (bx1 - bx0, y1 - y0, 0.02), (0, (y0 + y1) / 2, zc - hh))
bay = mesh_obj("BMO_BatteryBay", b, C_BODY, [M['body']])
mod_bevel(bay, 0.006, 2, 30)


def make_aa(name, coll):
    """AA cell lying along +X, centred on the origin (orange cap end at +X)."""
    b = bmesh.new()
    L, r = 0.36, 0.052
    o = add_cyl(b, r, L * 0.42, (L * 0.29, 0, 0), 'X', 32)
    k = add_cyl(b, r, L * 0.58, (-L * 0.21, 0, 0), 'X', 32)
    n = add_cyl(b, 0.018, 0.02, (L / 2 + 0.008, 0, 0), 'X', 20)
    set_mat_index(k, 1)
    set_mat_index(n, 2)
    ob = mesh_obj(name, b, coll, [M['aa_orange'], M['aa_black'], M['chrome']])
    mod_bevel(ob, 0.006, 3, 30)
    return ob


batteries = []
for i, z in enumerate((zc - 0.068, zc + 0.068)):
    aa = make_aa(f"BMO_Battery_AA.{i}", C_BODY)
    aa.location = (0, (y0 + y1) / 2 + 0.01, z)
    aa.rotation_euler = (0, 0, pi if i else 0)          # alternate polarity
    batteries.append(aa)
b = bmesh.new()
for s_ in (1, -1):
    for z in (zc - 0.068, zc + 0.068):
        add_cyl(b, 0.02, 0.008, (s_ * (bx1 - 0.014), (y0 + y1) / 2 + 0.01, z), 'X', 20)
contacts = mesh_obj("BMO_BatteryContacts", b, C_BODY, [M['chrome']], smooth=True)

# hinged door (hinge along the bottom edge, opens downward like the printed figure)
b = bmesh.new()
add_box(b, (BAT['w'] + 0.03, 0.022, BAT['h'] + 0.03), (0, 0.0, (BAT['h'] + 0.03) / 2))
add_box(b, (0.08, 0.03, 0.03), (0, 0.006, BAT['h'] + 0.01))                       # clip tab
weight_y_edges(b)
back_door = mesh_obj("BMO_BatteryDoor", b, C_BODY, [M['body']],
                     loc=(0, BACK_Y + 0.011, BAT['z'] - BAT['h'] / 2 - 0.015))
mod_corner_round(back_door, 0.03, 4)
mod_bevel(back_door, 0.005, 2, 30)
b = bmesh.new()
for x in (-0.15, 0.15):
    add_cyl(b, 0.012, 0.07, (x, 0.0, 0.0), 'X', 16)
door_gap = mesh_obj("BMO_BatteryDoorHinge", b, C_BODY, [M['body']],
                    loc=(0, BACK_Y + 0.011, BAT['z'] - BAT['h'] / 2 - 0.015), smooth=True)
back_screws = []

# --------------------------------------------------------------------------- limbs (single skinned meshes)


def catmull(pts, n):
    P = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def seg_dist(p, a, b_):
    ab = b_ - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def build_limb(name, bones, joints, path_pts, radius_fn, extras, mat=None):
    """bones: names; joints: bone joint positions (len(bones)+1);
    extras: list of (verts_builder(bm) -> verts, bone_index)."""
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()
    path = catmull(path_pts, 8)
    n = len(path)
    seg = 14
    rings = []
    prev_n = None
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        if prev_n is None:
            nv = t.orthogonal().normalized()
        else:
            nv = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = nv
        bv = t.cross(nv)
        r = radius_fn(i / (n - 1))
        rings.append((p, [bm.verts.new(p + (nv * cos(2 * pi * k / seg) + bv * sin(2 * pi * k / seg)) * r)
                          for k in range(seg)]))
    for i in range(n - 1):
        a, b_ = rings[i][1], rings[i + 1][1]
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b_[(k + 1) % seg], b_[k]))
    t0 = (path[1] - path[0]).normalized()
    t1 = (path[-1] - path[-2]).normalized()
    c0 = bm.verts.new(path[0] - t0 * radius_fn(0) * 0.7)
    c1 = bm.verts.new(path[-1] + t1 * radius_fn(1) * 0.7)
    for k in range(seg):
        bm.faces.new((rings[0][1][(k + 1) % seg], rings[0][1][k], c0))
        bm.faces.new((rings[-1][1][k], rings[-1][1][(k + 1) % seg], c1))
    rings.append((path[0], [c0]))
    rings.append((path[-1], [c1]))

    segs = [(joints[i], joints[i + 1]) for i in range(len(bones))]
    for ctr, verts in rings:
        d = [seg_dist(ctr, a, b_) for a, b_ in segs]
        dmin = min(d)
        raw = [max(0.0, 1 - (di - dmin) / 0.05) for di in d]
        tot = sum(raw)
        for v in verts:
            for bi, w in enumerate(raw):
                if w > 0:
                    v[dl][bi] = w / tot
    for builder, bi in extras:
        for v in builder(bm):
            v[dl][bi] = 1.0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    C_LIMB.objects.link(obj)
    for bn in bones:
        obj.vertex_groups.new(name=bn)
    me.materials.append(mat or M['limb'])
    me.shade_smooth()
    obj.parent = rig
    am = obj.modifiers.new("Armature", 'ARMATURE')
    am.object = rig
    mod_subsurf(obj, 1, 2)
    return obj


limbs = []
for s, sfx in ((1, "L"), (-1, "R")):
    J = ARM_J[sfx]
    hand_dir = (J[3] - J[2]).normalized()

    def hand_builder(bm, J=J, hand_dir=hand_dir, s=s):
        verts = []
        palm_c = J[3] + hand_dir * 0.005
        verts += add_sphere(bm, 0.036, palm_c, (0.62, 1.0, 1.05), 16)
        for ang in (-28, 0, 28):
            d = (Matrix.Rotation(radians(ang), 3, 'X') @ hand_dir).normalized()
            base = palm_c + d * 0.02
            verts += add_capsule(bm, base, base + d * 0.045, 0.0115, 10)
        thumb_d = (hand_dir * 0.6 + Vector((0, -1, 0))).normalized()
        verts += add_capsule(bm, palm_c, palm_c + thumb_d * 0.05, 0.012, 10)
        return verts

    path = [J[0] - Vector((s * 0.07, 0, 0))] + J
    limbs.append(build_limb(f"BMO_Arm.{sfx}", [f"arm_upper.{sfx}", f"arm_lower.{sfx}", f"hand.{sfx}"],
                            J, path, lambda t: 0.033 - 0.004 * t, [(hand_builder, 2)]))

    LJ = LEG_J[sfx]
    fj = FOOT_J[sfx]

    def foot_builder(bm, fj=fj, s=s):
        # rounded "boot" foot like the printed figure: chunky, wider than the leg
        a = fj[0] + Vector((0, 0.035, 0.0))
        b_ = fj[1] + Vector((0, 0.01, 0.0))
        return add_capsule(bm, a, b_, 0.068, 20, post_scale=(1.05, 1.0, 0.9))

    path = [LJ[0] + Vector((0, 0, 0.07))] + LJ
    joints = LJ + [fj[1]]
    limbs.append(build_limb(f"BMO_Leg.{sfx}", [f"thigh.{sfx}", f"shin.{sfx}", f"foot.{sfx}"],
                            joints, path, lambda t: 0.052, [(foot_builder, 2)], M['leg']))

# --------------------------------------------------------------------------- hierarchy
body_level = [shell, letters, sock, plate, screen, back_door, door_gap, bay, contacts] + batteries + int_objs + ribbon + [bay_cutter]
body_level += [o for o in C_BODY.objects if o.parent is None and o not in body_level and o not in back_screws]
for o in body_level:
    if o.parent is None:
        parent_keep(o, body_root)
for o in heart_face:
    parent_keep(o, heart)
for o in back_screws:
    parent_keep(o, back_door)
for o in plate_children + front_screws + cutters_plate + [pcb]:
    parent_keep(o, plate)
for o in pcb_children + cutters_pcb:
    parent_keep(o, pcb)
for o in [lcd, mouth] + eyes + happy_eyes:
    parent_keep(o, screen)
bpy.context.view_layer.update()

# --------------------------------------------------------------------------- drivers
drive(plate, "rotation_euler", 2, "-var*1.95", "lid_open")
drive(plate, "location", 1, f"{plate.location.y:.5f} - var*0.9", "explode")
drive(pcb, "location", 1, f"{pcb.location.y:.5f} + var*0.48", "explode")
for sc in front_screws:
    drive(sc, "location", 1, f"{sc.location.y:.5f} - var*0.42", "explode")
    drive(sc, "rotation_euler", 1, "var*31.4", "explode")
drive(screen, "location", 1, f"{screen.location.y:.5f} - var*0.12", "explode")
drive(back_door, "rotation_euler", 0, "-var*1.75", "back_open")
drive(door_gap, "rotation_euler", 0, "-var*1.75", "back_open")
for sc in back_screws:
    drive(sc, "location", 1, f"{sc.location.y:.5f} - var*0.3", "back_open")
    drive(sc, "rotation_euler", 1, "var*31.4", "back_open")
for e in eyes:
    drive(e, "location", 0, f"{e.location.x:.5f} + var*0.06", "eye_look_x")
    drive(e, "location", 2, f"{e.location.z:.5f} + var*0.04", "eye_look_z")
    drive(e, "scale", 2, "1 - var*0.93", "blink")
    drive(e, "scale", 0, "1 - var", "eyes_happy")
for he in happy_eyes:
    for i in range(3):
        drive(he, "scale", i, "var", "eyes_happy")
key = mouth.data.shape_keys
for kname, prop in (("Smile", "face_smile"), ("Open", "face_open"), ("Frown", "face_frown"),
                    ("Surprise", "face_surprise")):
    drive(key, f'key_blocks["{kname}"].value', None, "var", prop)
drive(M['lcd'].node_tree, 'nodes["Emission"].inputs[1].default_value', None, "var", "screen_on")
for i in range(3):
    drive(heart, "scale", i, "1 + 0.035*sin(frame*0.3)")

# hook the ribbon cable ends to the PCB so they follow the lid
bpy.context.view_layer.update()
for w in ribbon:
    hk = w.modifiers.new("HookPCB", 'HOOK')
    hk.object = pcb
    hk.vertex_indices_set([3, 4, 5])
    hk.matrix_inverse = pcb.matrix_world.inverted() @ w.matrix_world

# --------------------------------------------------------------------------- accessories
# game controller (as in the episode) with a cable plugged into the front port
b = bmesh.new()
base = add_box(b, (0.34, 0.24, 0.07), (0, 0, 0.035))
btn = add_cyl(b, 0.034, 0.03, (-0.08, -0.03, 0.075), 'Z', 32)
stick_base = add_sphere(b, 0.04, (0.08, 0.02, 0.07), (1, 1, 0.45), 20)
stick = add_cyl(b, 0.008, 0.13, (0.08, 0.02, 0.13), 'Z', 12)
ball = add_sphere(b, 0.024, (0.08, 0.02, 0.2), (1, 1, 1), 20)
set_mat_index(btn + ball, 1)
set_mat_index(stick, 2)
set_mat_index(stick_base, 3)
controller = mesh_obj("Acc_Controller", b, C_ACC, [M['ctrl'], M['red'], M['chrome'], M['chip']],
                      loc=(0.95, -0.95, 0.0), smooth=True)
controller.rotation_euler = (0, 0, radians(18))
mod_bevel(controller, 0.012, 3, 30, harden=False)

b = bmesh.new()
add_box(b, (PORT['w'] - 0.015, 0.05, PORT['h'] - 0.015), (PORT['x'], PLATE_FRONT - 0.005, PORT['z']))
add_cyl(b, 0.016, 0.05, (PORT['x'], PLATE_FRONT - 0.05, PORT['z']), 'Y', 16)
plug = mesh_obj("Acc_ControllerPlug", b, C_ACC, [M['chip']], smooth=True)
parent_keep(plug, plate)
cable_pts = [(0.84, -0.86, 0.025), (0.62, -0.98, 0.012), (0.30, -1.08, 0.012), (0.02, -1.02, 0.012),
             (-0.06, -0.82, 0.012), (0.10, -0.68, 0.015), (0.24, -0.60, 0.10), (0.25, -0.52, 0.40),
             (PORT['x'], -0.47, PORT['z']), (PORT['x'], PLATE_FRONT - 0.07, PORT['z'])]
cable = curve_obj("Acc_ControllerCable", cable_pts, C_ACC, M['w_blk'], 0.009, 'NURBS', res=24)
bpy.context.view_layer.update()
hk = cable.modifiers.new("HookPlate", 'HOOK')
hk.object = plate
hk.vertex_indices_set([8, 9])
hk.matrix_inverse = plate.matrix_world.inverted() @ cable.matrix_world


# cartridges
def make_cartridge(name, label_mat):
    b = bmesh.new()
    shell_v = add_box(b, (0.34, 0.26, 0.022), (0, 0, 0))
    lbl = add_box(b, (0.24, 0.16, 0.024), (0, 0.03, 0.0))
    grip = []
    for i in range(5):
        grip += add_box(b, (0.30, 0.006, 0.025), (0, -0.115 + i * 0.01, 0))
    pins = add_box(b, (0.26, 0.02, 0.012), (0, 0.13, 0))
    set_mat_index(lbl, 1)
    set_mat_index(pins, 2)
    o = mesh_obj(name, b, C_ACC, [M['cart'], label_mat, M['gold']])
    mod_bevel(o, 0.004, 2, 30, harden=False)
    return o


cart_in = make_cartridge("Acc_Cartridge_Insert", M['cart_lbl'])
cart_in.location = (SLOT['x'], -0.75, SLOT['z'])
parent_keep(cart_in, body_root)
drive(cart_in, "location", 1, f"{cart_in.location.y:.5f} + var*0.48", "cartridge_insert")
drive(cart_in, "hide_render", None, "var < 0.001", "cartridge_insert")
drive(cart_in, "hide_viewport", None, "var < 0.001", "cartridge_insert")
cart_floor = make_cartridge("Acc_Cartridge_Floor", M['cyan'])
cart_floor.location = (-0.85, -1.0, 0.012)
cart_floor.rotation_euler = (0, 0, radians(-25))

# screwdriver
b = bmesh.new()
h1 = add_cyl(b, 0.032, 0.18, (0, 0, 0), 'X', 8)
h2 = add_sphere(b, 0.032, (-0.09, 0, 0), (0.5, 1, 1), 16)
h3 = add_cyl(b, 0.032, 0.04, (0.11, 0, 0), 'X', 16, r2=0.018)
shaft = add_cyl(b, 0.006, 0.24, (0.25, 0, 0), 'X', 12)
tipv = add_box(b, (0.02, 0.012, 0.003), (0.375, 0, 0))
set_mat_index(shaft + tipv, 1)
screwdriver = mesh_obj("Acc_Screwdriver", b, C_ACC, [M['handle'], M['chrome']], loc=(-1.05, -0.55, 0.032),
                       smooth=True)
screwdriver.rotation_euler = (0, 0, radians(-35))
mod_bevel(screwdriver, 0.004, 2, 40, harden=False)

for i, (p, r) in enumerate((((-0.70, -0.62, 0.022), (radians(90), 0, radians(30))),
                            ((-0.62, -0.72, 0.022), (radians(90), 0, radians(-60))))):
    sc = make_screw(f"Acc_SpareScrew.{i}", C_ACC)
    sc.location = p
    sc.rotation_euler = r

# --------------------------------------------------------------------------- stage
b = bmesh.new()
prof = []
for i in range(25):
    a = (pi / 2) * i / 24
    prof.append((2.2 + 1.6 * sin(a), 1.6 - 1.6 * cos(a)))
prof = [(-12.0, 0.0), (-2.0, 0.0)] + prof + [(3.8, 12.0)]
rowL = [b.verts.new((-16, y, z)) for y, z in prof]
rowR = [b.verts.new((16, y, z)) for y, z in prof]
for i in range(len(prof) - 1):
    b.faces.new((rowL[i], rowR[i], rowR[i + 1], rowL[i + 1]))
stage = mesh_obj("Stage_Backdrop", b, C_STAGE, [M['floor']], smooth=True)
if stage.data.polygons[0].normal.z < 0:
    stage.data.flip_normals()

world = scene.world or bpy.data.worlds.new("World")
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
if bg:
    bg.inputs[0].default_value = hex_lin('#6E3A22')
    bg.inputs[1].default_value = 0.6


def add_light(name, kind, loc, energy, color, size=1.0, target=(0, 0, 1.0)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    o = bpy.data.objects.new(name, ld)
    C_STAGE.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


add_light("Light_Key", 'AREA', (-2.6, -3.0, 4.0), 650, (1.0, 0.93, 0.85), 3.0)
add_light("Light_Fill", 'AREA', (3.6, -2.4, 2.2), 300, (0.85, 0.92, 1.0), 3.0)
add_light("Light_Rim", 'AREA', (1.6, 3.0, 3.6), 600, (1.0, 0.9, 0.8), 2.0)

target = bpy.data.objects.new("Camera_Target", None)
C_STAGE.objects.link(target)
target.location = (0, -0.1, 0.95)
cam_d = bpy.data.cameras.new("Camera")
cam_d.lens = 50
cam = bpy.data.objects.new("Camera", cam_d)
C_STAGE.objects.link(cam)
cam.location = (3.3, -5.0, 2.5)
tt = cam.constraints.new('TRACK_TO')
tt.target = target
tt.track_axis = 'TRACK_NEGATIVE_Z'
tt.up_axis = 'UP_Y'
scene.camera = cam

# --------------------------------------------------------------------------- render settings
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.fps = 24
try:
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = True
    scene.eevee.use_shadows = True
except Exception:
    pass
for vt in ('Standard', 'AgX', 'Filmic'):
    try:
        scene.view_settings.view_transform = vt
        break
    except Exception:
        continue

# hide cutters
for o in C_CUT.all_objects:
    o.hide_render = True
lc = bpy.context.view_layer.layer_collection.children["BMO"].children["BMO_Cutters"]
lc.hide_viewport = True

# --------------------------------------------------------------------------- animation clips
pb = rig.pose.bones
DEFAULTS = {k: v[0] for k, v in PROPS.items()}


def prot(name, rots):
    b_ = pb[name]
    Mx = b_.bone.matrix_local.to_3x3()
    R = Matrix.Identity(3)
    for ax, deg in rots:
        R = Matrix.Rotation(radians(deg), 3, ax) @ R
    b_.rotation_quaternion = (Mx.inverted() @ R @ Mx).to_quaternion()


def ploc(name, vec):
    b_ = pb[name]
    b_.location = b_.bone.matrix_local.to_3x3().inverted() @ Vector(vec)


def key_pose(f, rot=None, loc=None, props=None):
    for n, r in (rot or {}).items():
        prot(n, r)
        pb[n].keyframe_insert("rotation_quaternion", frame=f, group=n)
    for n, l in (loc or {}).items():
        ploc(n, l)
        pb[n].keyframe_insert("location", frame=f, group=n)
    for k, v in (props or {}).items():
        rig[k] = v
        rig.keyframe_insert(f'["{k}"]', frame=f, group="Controls")


ANIM_BONES = [b_.name for b_ in pb if b_.name != "root"]


def key_rest(f, props=True):
    key_pose(f, rot={n: [] for n in ANIM_BONES}, loc={n: (0, 0, 0) for n in ANIM_BONES},
             props=DEFAULTS if props else None)


def clip_idle(f0):
    key_rest(f0)
    for i, f in enumerate((24, 48, 72)):
        dz = -0.015 if i % 2 == 0 else 0.0
        sw = 4 if i % 2 == 0 else -2
        key_pose(f0 + f, rot={"arm_upper.L": [('Y', -sw)], "arm_upper.R": [('Y', sw)],
                              "body": [('Y', 1.5 if i % 2 == 0 else -1)]},
                 loc={"body": (0, 0, dz)})
    key_pose(f0 + 38, props={"blink": 0.0})
    key_pose(f0 + 41, props={"blink": 1.0})
    key_pose(f0 + 44, props={"blink": 0.0})
    key_pose(f0 + 52, props={"eye_look_x": 0.0})
    key_pose(f0 + 58, props={"eye_look_x": 0.7})
    key_pose(f0 + 74, props={"eye_look_x": 0.7})
    key_pose(f0 + 80, props={"eye_look_x": 0.0})
    key_rest(f0 + 96)
    return 96


def clip_wave(f0):
    key_rest(f0)
    up = {"arm_upper.L": [('Y', -105)], "arm_lower.L": [('Y', -50)], "hand.L": [('Y', -10)],
          "body": [('Y', -4)]}
    key_pose(f0 + 10, rot=up, props={"face_smile": 0.0, "face_open": 1.0, "eyes_happy": 1.0})
    for i in range(6):
        a = -30 if i % 2 == 0 else -70
        key_pose(f0 + 16 + i * 6, rot={"arm_lower.L": [('Y', a)], "hand.L": [('Y', -25 if i % 2 == 0 else 10)]})
    key_pose(f0 + 54, rot=up, props={"face_open": 1.0, "eyes_happy": 1.0})
    key_pose(f0 + 60, props={"blink": 0.0, "eyes_happy": 0.0})
    key_pose(f0 + 62, props={"blink": 1.0, "face_open": 0.0, "face_smile": 1.0})
    key_pose(f0 + 65, props={"blink": 0.0})
    key_rest(f0 + 72)
    return 72


STRIDE = 0.10


def walk_keys(f0, cycles):
    """In-place walk cycle (24 frames / cycle) driven by the foot IK targets."""
    n = 24 * cycles
    for f in range(0, n + 1, 3):
        p = (f % 24) / 24.0
        loc, rot = {}, {}
        for sfx, ph in (("L", 0.0), ("R", 0.5)):
            q = (p + ph) % 1.0
            if q < 0.5:
                dy, dz = -STRIDE / 2 + STRIDE * (q / 0.5), 0.0
            else:
                u = (q - 0.5) / 0.5
                dy, dz = STRIDE / 2 - STRIDE * u, 0.07 * sin(pi * u)
            loc[f"foot_ik.{sfx}"] = (0, dy, dz)
            # arm swings opposite to the same-side leg
            rot[f"arm_upper.{sfx}"] = [('X', -dy / (STRIDE / 2) * -18)]
            rot[f"arm_lower.{sfx}"] = [('X', -8)]
        bob = -0.018 * (0.5 + 0.5 * cos(4 * pi * p))
        loc["body"] = (0, 0, bob)
        rot["body"] = [('Y', 3 * sin(2 * pi * p)), ('Z', 4 * sin(2 * pi * p))]
        key_pose(f0 + f, rot=rot, loc=loc)
    return n


def clip_walk(f0):
    walk_keys(f0, 2)
    key_pose(f0, props={"face_smile": 1.0})
    return 48


def clip_talk(f0):
    key_rest(f0)
    pattern = [0.8, 0.2, 1.0, 0.1, 0.6, 0.0, 0.9, 0.3, 1.0, 0.0, 0.7, 0.2, 0.0]
    for i, v in enumerate(pattern):
        key_pose(f0 + 4 + i * 4, props={"face_open": v, "face_smile": 1.0 - v})
    key_pose(f0 + 14, rot={"arm_upper.R": [('Y', 50), ('X', -15)], "arm_lower.R": [('Y', 40)],
                           "body": [('Y', 3)]}, loc={"body": (0, 0, -0.01)})
    key_pose(f0 + 34, rot={"arm_upper.R": [('Y', 35), ('X', -25)], "arm_lower.R": [('Y', 55)],
                           "body": [('Y', -2)]}, loc={"body": (0, 0, 0.0)})
    key_pose(f0 + 56, rot={"arm_upper.R": [], "arm_lower.R": [], "body": []},
             props={"face_surprise": 0.0, "face_smile": 1.0})
    key_pose(f0 + 60, props={"face_surprise": 1.0, "face_smile": 0.0, "face_open": 0.0})
    key_pose(f0 + 68, props={"face_surprise": 1.0})
    key_rest(f0 + 72)
    return 72


def clip_lid(f0):
    key_rest(f0)
    key_pose(f0 + 8, props={"face_surprise": 0.0, "face_smile": 1.0})
    key_pose(f0 + 14, props={"face_surprise": 1.0, "face_smile": 0.0, "lid_open": 0.0},
             rot={"arm_upper.L": [], "arm_upper.R": []})
    key_pose(f0 + 40, props={"lid_open": 1.0, "eye_look_x": 0.0},
             rot={"arm_upper.L": [('Y', -35)], "arm_upper.R": [('Y', 35)]})
    key_pose(f0 + 50, props={"eye_look_x": -1.0})
    key_pose(f0 + 64, props={"lid_open": 1.0, "eye_look_x": -1.0, "face_surprise": 1.0},
             rot={"arm_upper.L": [('Y', -35)], "arm_upper.R": [('Y', 35)]})
    key_pose(f0 + 70, props={"eye_look_x": 0.0})
    key_pose(f0 + 86, props={"lid_open": 0.0, "face_surprise": 0.0, "face_smile": 1.0},
             rot={"arm_upper.L": [], "arm_upper.R": []})
    key_rest(f0 + 96)
    return 96


def clip_explode(f0):
    key_rest(f0)
    key_pose(f0 + 8, props={"explode": 0.0, "back_open": 0.0, "face_surprise": 0.0, "face_smile": 1.0},
             loc={"body": (0, 0, 0)}, rot={"arm_upper.L": [], "arm_upper.R": []})
    key_pose(f0 + 14, props={"face_surprise": 1.0, "face_smile": 0.0})
    key_pose(f0 + 50, props={"explode": 1.0, "back_open": 1.0}, loc={"body": (0, 0, 0.12)},
             rot={"arm_upper.L": [('Y', -40)], "arm_upper.R": [('Y', 40)], "body": [('X', -6)]})
    key_pose(f0 + 60, props={"face_surprise": 0.0, "face_open": 1.0})
    key_pose(f0 + 82, props={"explode": 1.0, "back_open": 1.0, "face_open": 1.0}, loc={"body": (0, 0, 0.12)},
             rot={"arm_upper.L": [('Y', -40)], "arm_upper.R": [('Y', 40)], "body": [('X', -6)]})
    key_pose(f0 + 110, props={"explode": 0.0, "back_open": 0.0, "face_open": 0.0, "face_smile": 1.0},
             loc={"body": (0, 0, 0)}, rot={"arm_upper.L": [], "arm_upper.R": [], "body": []})
    key_rest(f0 + 120)
    return 120


def clip_play(f0):
    """Insert a cartridge and play: screen flickers, BMO bounces happily."""
    key_rest(f0)
    key_pose(f0 + 6, props={"cartridge_insert": 0.0})
    key_pose(f0 + 7, props={"cartridge_insert": 0.01})
    key_pose(f0 + 30, props={"cartridge_insert": 1.0, "screen_on": 1.0})
    key_pose(f0 + 33, props={"screen_on": 0.1, "blink": 1.0})
    key_pose(f0 + 36, props={"screen_on": 1.6, "blink": 0.0})
    key_pose(f0 + 40, props={"screen_on": 1.0, "face_smile": 0.0, "face_open": 1.0})
    for i in range(4):
        f = f0 + 42 + i * 8
        key_pose(f, loc={"body": (0, 0, 0)})
        key_pose(f + 4, loc={"body": (0, 0, -0.035)},
                 rot={"arm_upper.L": [('Y', -60)], "arm_upper.R": [('Y', 60)]})
        key_pose(f + 8, rot={"arm_upper.L": [('Y', -20)], "arm_upper.R": [('Y', 20)]})
    key_pose(f0 + 84, props={"cartridge_insert": 1.0, "face_open": 1.0})
    key_pose(f0 + 100, props={"cartridge_insert": 0.01})
    key_pose(f0 + 101, props={"cartridge_insert": 0.0})
    key_rest(f0 + 108)
    return 108


SIT_POSE = dict(
    rot={"arm_upper.L": [('Y', -48)], "arm_upper.R": [('Y', 48)], "arm_lower.L": [('Y', 30)],
         "arm_lower.R": [('Y', -30)], "body": [('X', -3)],
         "foot_ik.L": [('X', -80)], "foot_ik.R": [('X', -80)]},
    loc={"body": (0, 0, -0.37), "foot_ik.L": (0.02, -0.43, 0.0), "foot_ik.R": (-0.02, -0.43, 0.0)})


def clip_sit(f0):
    """Plop down and sit like the printed figure, look around happily, then stand back up."""
    key_rest(f0)
    key_pose(f0 + 6, loc={"body": (0, 0, 0.02)}, rot={"arm_upper.L": [('Y', -20)], "arm_upper.R": [('Y', 20)]})
    key_pose(f0 + 18, loc={"body": (0, 0, -0.26), "foot_ik.L": (0.01, -0.3, 0.05), "foot_ik.R": (-0.01, -0.3, 0.05)},
             rot={"arm_upper.L": [('Y', -70)], "arm_upper.R": [('Y', 70)], "foot_ik.L": [('X', -50)],
                  "foot_ik.R": [('X', -50)]}, props={"face_surprise": 1.0, "face_smile": 0.0})
    key_pose(f0 + 26, **SIT_POSE, props={"face_surprise": 0.0, "face_open": 1.0, "eyes_happy": 1.0})
    key_pose(f0 + 30, loc={"body": (0, 0, -0.355)})
    key_pose(f0 + 34, **SIT_POSE)
    key_pose(f0 + 56, props={"face_open": 1.0, "eyes_happy": 1.0})
    key_pose(f0 + 62, props={"face_open": 0.0, "face_smile": 1.0, "eyes_happy": 0.0, "eye_look_x": 0.0})
    key_pose(f0 + 70, props={"eye_look_x": -0.8})
    key_pose(f0 + 80, props={"eye_look_x": -0.8, "blink": 0.0})
    key_pose(f0 + 83, props={"blink": 1.0})
    key_pose(f0 + 86, props={"blink": 0.0, "eye_look_x": 0.6})
    key_pose(f0 + 96, props={"eye_look_x": 0.0})
    key_pose(f0 + 100, **SIT_POSE)
    key_pose(f0 + 114, loc={"body": (0, 0, -0.18), "foot_ik.L": (0.01, -0.12, 0.04), "foot_ik.R": (-0.01, -0.12, 0.04)},
             rot={"arm_upper.L": [('Y', -60)], "arm_upper.R": [('Y', 60)], "foot_ik.L": [('X', -15)],
                  "foot_ik.R": [('X', -15)], "body": [('X', 6)]})
    key_rest(f0 + 126)
    return 126


def clip_sad(f0):
    """Sad BMO: frown, dim screen, slumped body, droopy arms and a long sigh."""
    key_rest(f0)
    sad = dict(rot={"body": [('X', 9)], "arm_upper.L": [('Y', 12)], "arm_upper.R": [('Y', -12)],
                    "arm_lower.L": [('Y', 8)], "arm_lower.R": [('Y', -8)]}, loc={"body": (0, 0, -0.035)})
    key_pose(f0 + 16, **sad, props={"face_smile": 0.0, "face_frown": 1.0, "eye_look_z": -0.8, "screen_on": 0.55})
    key_pose(f0 + 40, rot={"body": [('X', 5)]}, loc={"body": (0, 0, -0.005)}, props={"blink": 0.0})
    key_pose(f0 + 44, props={"blink": 1.0})
    key_pose(f0 + 56, **sad, props={"blink": 1.0, "face_frown": 1.0})
    key_pose(f0 + 60, props={"blink": 0.0, "eye_look_x": 0.0})
    key_pose(f0 + 66, props={"eye_look_x": -0.6})
    key_pose(f0 + 80, **sad, props={"eye_look_x": -0.6, "face_frown": 1.0, "screen_on": 0.55, "eye_look_z": -0.8})
    key_rest(f0 + 96)
    return 96


def clip_battery(f0):
    """Battery door swings down, shows the AA cells, then clicks shut."""
    key_rest(f0)
    key_pose(f0 + 8, props={"back_open": 0.0, "eye_look_x": 0.0, "face_smile": 1.0, "face_surprise": 0.0})
    key_pose(f0 + 16, props={"eye_look_x": 1.0, "face_smile": 0.0, "face_surprise": 1.0})
    key_pose(f0 + 38, props={"back_open": 1.0}, rot={"arm_upper.R": [('Y', 25), ('X', 20)]})
    key_pose(f0 + 46, props={"back_open": 0.97})
    key_pose(f0 + 52, props={"back_open": 1.0})
    key_pose(f0 + 74, props={"back_open": 1.0, "eye_look_x": 1.0}, rot={"arm_upper.R": [('Y', 25), ('X', 20)]})
    key_pose(f0 + 96, props={"back_open": 0.0, "face_surprise": 0.0, "face_smile": 1.0, "eye_look_x": 0.0},
             rot={"arm_upper.R": []})
    key_pose(f0 + 100, loc={"body": (0, 0, -0.012)})
    key_rest(f0 + 108)
    return 108


CLIPS = [("Idle", clip_idle), ("Wave", clip_wave), ("Walk", clip_walk), ("Talk", clip_talk),
         ("OpenLid", clip_lid), ("BatteryDoor", clip_battery), ("Explode", clip_explode),
         ("PlayGame", clip_play), ("Sit", clip_sit), ("Sad", clip_sad)]

rig.animation_data_create()


def action_fcurves(obj):
    act = obj.animation_data.action
    try:
        return list(act.fcurves)
    except Exception:
        pass
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(act, obj.animation_data.action_slot)
        return list(cb.fcurves) if cb else []
    except Exception:
        return []


for cname, fn in CLIPS:
    act = bpy.data.actions.new(f"BMO_{cname}")
    rig.animation_data.action = act
    length = fn(1)
    act.use_fake_user = True
    try:
        act.use_frame_range = True
        act.frame_start, act.frame_end = 1, 1 + length
        act.use_cyclic = cname in ("Idle", "Walk")
    except Exception:
        pass
    if cname == "Walk":
        for fc in action_fcurves(rig):
            fc.modifiers.new('CYCLES')

# showreel: every clip in sequence + root motion while walking
reel = bpy.data.actions.new("BMO_Showreel")
reel.use_fake_user = True
rig.animation_data.action = reel
f = 1
MARKERS = []
for cname, fn in CLIPS:
    if cname == "Walk":
        key_rest(f)
        n = walk_keys(f + 4, 4)
        key_pose(f, loc={"root": (0, 0.45, 0)})
        key_pose(f + 4, loc={"root": (0, 0.45, 0)})
        key_pose(f + 4 + n, loc={"root": (0, 0.45 - STRIDE / 12 * n, 0)})
        key_rest(f + 8 + n)
        length = n + 8
    else:
        length = fn(f)
    MARKERS.append((cname, f))
    f += length + 1
    if cname == "Idle":
        key_pose(1, loc={"root": (0, 0.45, 0)})
for fc in action_fcurves(rig):
    if 'root' in fc.data_path:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
scene.frame_start, scene.frame_end = 1, f
for name, fr in MARKERS:
    scene.timeline_markers.new(name, frame=fr)

# back to a clean rest pose at frame 1
scene.frame_set(1)

# --------------------------------------------------------------------------- report & save
bad = [(getattr(i, 'name', '?'), p) for i, p, d in DRIVERS if not d.is_simple_expression]
print("BMO: drivers", len(DRIVERS), "non-simple:", bad)
print("BMO: objects", len(bpy.data.objects), "frames", scene.frame_start, scene.frame_end)

out = os.path.join(os.getcwd(), "bmo.blend")
if "--" in sys.argv:
    args = sys.argv[sys.argv.index("--") + 1:]
    if "--out" in args:
        out = os.path.abspath(args[args.index("--out") + 1])
if bpy.app.background or "--out" in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("BMO: saved", out)
