import { Box3, Group, Mesh, Object3D, Quaternion, Vector3, type ShaderMaterial } from 'three'
import type { Props } from '../state/bmoStore'

/**
 * 1:1 port of the Blender drivers in bmo_build.py ("drivers" block).
 * Blender is Z-up / BMO faces -Y; the glTF export is Y-up / BMO faces +Z, so a Blender
 * local offset (x, y, z) becomes (x, z, -y) here. Offsets are applied on top of the rest
 * transform captured from each node at load time.
 */
interface Rest {
  obj: Object3D
  pos: Vector3
  quat: Quaternion
  scale: Vector3
}

export interface Rig {
  plate?: Rest
  pcb?: Rest
  screen?: Rest
  door: Rest[]
  frontScrews: Rest[]
  eyes: Rest[]
  happyEyes: Rest[]
  heart?: Rest
  cartridge?: Rest
  mouth?: Mesh
  lcd?: ShaderMaterial
  buttons: Record<string, Rest>
}

/** three.js GLTFLoader strips '.', ':', '/', '[' and ']' from node names. */
export const sanitize = (n: string) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '')

const rest = (obj?: Object3D): Rest | undefined =>
  obj && { obj, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() }

/**
 * Mesh compression (meshopt quantization) may move a node's origin to its bounding-box centre,
 * which would make hinges rotate around their middle. Re-create the real hinge: wrap the node in
 * a pivot group placed on the hinge line, computed from the node's own geometry bounds.
 */
function hinge(obj: Object3D | undefined, pick: (b: Box3) => Vector3): Object3D | undefined {
  if (!obj?.parent) return obj
  if (obj.parent.userData.isPivot) return obj.parent // already wrapped (React StrictMode re-run)
  const mesh = obj as Mesh
  const box = new Box3()
  if (mesh.geometry) {
    mesh.geometry.computeBoundingBox()
    box.copy(mesh.geometry.boundingBox!).applyMatrix4(obj.matrix)
  } else {
    box.setFromObject(obj) // fallback (world space == parent space at rest for these parts)
  }
  const h = pick(box)
  const pivot = new Group()
  pivot.name = `${obj.name}_pivot`
  pivot.userData.isPivot = true
  pivot.position.copy(h)
  obj.parent.add(pivot)
  obj.position.sub(h)
  pivot.add(obj)
  obj.updateMatrix()
  return pivot
}

export const BUTTONS = ['Btn_DPad', 'Btn_Red', 'Btn_Green', 'Btn_Triangle', 'Btn_BlueDot', 'Btn_Dashes'] as const

export function buildRig(root: Object3D, lcd: ShaderMaterial): Rig {
  const get = (n: string) => root.getObjectByName(sanitize(n))
  const many = (names: string[]) => names.map((n) => rest(get(n))).filter((r): r is Rest => !!r)
  const buttons: Record<string, Rest> = {}
  for (const b of BUTTONS) {
    const r = rest(get(b))
    if (r) buttons[b] = r
  }
  let mouth: Mesh | undefined
  get('Face_Mouth')?.traverse((o) => {
    if ((o as Mesh).morphTargetInfluences) mouth = o as Mesh
  })
  // faceplate hinge: left edge, back face. Battery door hinge: bottom edge, mid thickness.
  const plate = hinge(get('BMO_Faceplate'), (b) => new Vector3(b.min.x, (b.min.y + b.max.y) / 2, b.min.z))
  const doorObj = get('BMO_BatteryDoor')
  let doorHinge: Vector3 | undefined
  const door = hinge(doorObj, (b) => (doorHinge = new Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2)))
  const doorPin = hinge(get('BMO_BatteryDoorHinge'), (b) => doorHinge ?? b.getCenter(new Vector3()))
  return {
    plate: rest(plate),
    pcb: rest(get('BMO_PCB')),
    screen: rest(get('BMO_ScreenModule')),
    door: [rest(door), rest(doorPin)].filter((r): r is Rest => !!r),
    frontScrews: many([0, 1, 2, 3].map((i) => `Screw_Front.${i}`)),
    eyes: many(['Face_Eye.L', 'Face_Eye.R']),
    happyEyes: many(['Face_HappyEye.L', 'Face_HappyEye.R']),
    heart: rest(get('Int_Heart')),
    cartridge: rest(get('Acc_Cartridge_Insert')),
    mouth,
    lcd,
    buttons,
  }
}

const _q = new Quaternion()
const AX = new Vector3(1, 0, 0)
const AY = new Vector3(0, 1, 0)
const AZ = new Vector3(0, 0, 1)

function rotate(r: Rest, axis: Vector3, angle: number) {
  r.obj.quaternion.copy(r.quat).multiply(_q.setFromAxisAngle(axis, angle))
}

const MORPHS = ['Smile', 'Open', 'Frown', 'Surprise'] as const
const MORPH_PROPS = ['face_smile', 'face_open', 'face_frown', 'face_surprise'] as const

export function applyDrivers(rig: Rig, v: Props, time: number, press: Record<string, number>, faceVisible = true) {
  const { plate, pcb, screen, heart, cartridge, mouth } = rig
  if (plate) {
    rotate(plate, AY, -v.lid_open * 1.95) // hinge: rotation_euler.z = -var*1.95
    plate.obj.position.z = plate.pos.z + v.explode * 0.9 // location.y - var*0.9
  }
  if (pcb) pcb.obj.position.z = pcb.pos.z - v.explode * 0.48
  for (const s of rig.frontScrews) {
    s.obj.position.z = s.pos.z + v.explode * 0.42
    rotate(s, AZ, -v.explode * 31.4)
  }
  if (screen) screen.obj.position.z = screen.pos.z + v.explode * 0.12
  for (const d of rig.door) rotate(d, AX, -v.back_open * 1.75)
  for (const e of rig.eyes) {
    e.obj.position.x = e.pos.x + v.eye_look_x * 0.06
    e.obj.position.y = e.pos.y + v.eye_look_z * 0.04
    // normal eyes and ^ ^ eyes swap at the halfway point (never both: that reads as arrows)
    e.obj.scale.set(e.scale.x, e.scale.y * (1 - v.blink * 0.93), e.scale.z)
    e.obj.visible = faceVisible && v.eyes_happy < 0.5
  }
  for (const h of rig.happyEyes) {
    h.obj.scale.copy(h.scale).multiplyScalar(0.85 + 0.15 * Math.min(1, v.eyes_happy * 2 - 1))
    h.obj.visible = faceVisible && v.eyes_happy >= 0.5
  }
  if (mouth) mouth.visible = faceVisible
  if (mouth?.morphTargetInfluences && mouth.morphTargetDictionary) {
    MORPHS.forEach((m, i) => {
      const idx = mouth.morphTargetDictionary![m]
      if (idx !== undefined) mouth.morphTargetInfluences![idx] = v[MORPH_PROPS[i]]
    })
  }
  if (rig.lcd) rig.lcd.uniforms.uStrength.value = v.screen_on
  if (heart) heart.obj.scale.copy(heart.scale).multiplyScalar(1 + 0.035 * Math.sin(time * 24 * 0.3)) // frame-based beat
  if (cartridge) {
    cartridge.obj.position.z = cartridge.pos.z - v.cartridge_insert * 0.48
    cartridge.obj.visible = v.cartridge_insert > 0.001
  }
  for (const [name, b] of Object.entries(rig.buttons)) {
    b.obj.position.z = b.pos.z - (press[name] ?? 0) * 0.014
  }
}
