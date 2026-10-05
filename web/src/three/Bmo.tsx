import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { easing } from 'maath'
import {
  Box3,
  BufferAttribute,
  CanvasTexture,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  VideoTexture,
  type AnimationAction,
  type Group,
} from 'three'
import {
  DEFAULT_PROPS,
  PROP_NAMES,
  prefersReducedMotion,
  scrollState,
  useBmo,
  type ClipName,
  type PropName,
  type Props,
} from '../state/bmoStore'
import { HOTSPOTS } from '../content/bmo'
import { GameConsole } from '../games/console'
import { BTN_TO_MESH, input, MESH_TO_BTN, type Btn } from '../state/input'
import { getFileVideo, screenOverlay } from '../state/media'
import { sfx, type SfxName } from '../audio/sfx'

const BTN_SOUND: Record<string, SfxName> = {
  Btn_Red: 'btn_red', Btn_Green: 'btn_green', Btn_Triangle: 'btn_triangle',
  Btn_DPad: 'btn_dpad', Btn_Dashes: 'btn_dashes', Btn_BlueDot: 'btn_blue',
}
const VIRTUAL_SOUND: Record<Btn, SfxName> = {
  up: 'btn_dpad', down: 'btn_dpad', left: 'btn_dpad', right: 'btn_dpad',
  a: 'btn_red', b: 'btn_green', c: 'btn_triangle', start: 'btn_dashes', power: 'btn_blue',
}

/** Threshold watchers: play a sound when a live value crosses into / out of a state (with hysteresis). */
type Watch = { prop: PropName; on: number; off: number; up?: SfxName; down?: SfxName; state: boolean }
const makeWatches = (): Watch[] => [
  { prop: 'lid_open', on: 0.1, off: 0.04, up: 'lidOpen', down: 'lidClose', state: false },
  { prop: 'back_open', on: 0.1, off: 0.04, up: 'doorOpen', down: 'doorClose', state: false },
  { prop: 'explode', on: 0.12, off: 0.05, up: 'explode', down: 'assemble', state: false },
  { prop: 'cartridge_insert', on: 0.6, off: 0.2, up: 'cartridge', state: false },
  { prop: 'eyes_happy', on: 0.6, off: 0.3, up: 'laugh', state: false },
  { prop: 'face_surprise', on: 0.6, off: 0.3, up: 'surprise', state: false },
  { prop: 'face_frown', on: 0.6, off: 0.3, up: 'sad', state: false },
  { prop: 'blink', on: 0.7, off: 0.3, up: 'blink', state: false },
]
import { createLcdMaterial } from './LcdMaterial'
import { applyDrivers, BUTTONS, buildRig, sanitize } from './drivers'
import { presetFor } from './presets'

const BASE = import.meta.env.BASE_URL
const MODEL_URL = `${BASE}models/bmo.glb`
const CLIPS_URL = `${BASE}models/clips.json`
const FPS = 24

type ClipJson = { fps: number; frames: number; loop: boolean; props: Record<string, number[]> }
type Track = [PropName, number[]]

const CLICKABLE = new Set(
  [...BUTTONS, 'BMO_Faceplate', 'BMO_Shell', 'BMO_LCD', 'BMO_ScreenModule', 'Int_Heart', 'BMO_BatteryDoor',
    'BMO_BatteryDoorHinge', 'BMO_Letters'].map(sanitize),
)
const DRIVEN = new Set(
  [...BUTTONS, 'BMO_Faceplate', 'BMO_PCB', 'BMO_ScreenModule', 'BMO_BatteryDoor', 'BMO_BatteryDoorHinge',
    'Face_Eye.L', 'Face_Eye.R', 'Face_HappyEye.L', 'Face_HappyEye.R', 'Int_Heart', 'Acc_Cartridge_Insert',
    'Face_Mouth', 'Screw_Front.0', 'Screw_Front.1', 'Screw_Front.2', 'Screw_Front.3', 'BMO_BodyRoot'].map(sanitize),
)

/** Multi-material glTF meshes become a Group with children "<name>_1", "<name>_2"… */
const owner = (o: Object3D): Object3D =>
  o.parent && o.parent.type !== 'Bone' && o.name.startsWith(o.parent.name + '_') ? o.parent : o

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function blobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.42)')
  grd.addColorStop(0.55, 'rgba(0,0,0,0.16)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

export function Bmo() {
  const outer = useRef<Group>(null!)
  const walker = useRef<Group>(null!)
  const { scene, animations } = useGLTF(MODEL_URL, false, true)
  const { actions, mixer } = useAnimations(animations, scene)
  const lcd = useMemo(createLcdMaterial, [])
  const shadowTex = useMemo(blobTexture, [])
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __bmoCam: camera })
  }, [camera])

  const rig = useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      if (sanitize('BMO_LCD') === m.name) m.material = lcd
      const own = owner(m)
      if (!CLICKABLE.has(own.name)) m.raycast = () => {}
      if ((m as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
      // static parts: skip per-frame matrix recomposition
      if (!DRIVEN.has(own.name) && !DRIVEN.has(m.name) && m.parent?.type !== 'Bone') {
        m.updateMatrix()
        m.matrixAutoUpdate = false
      }
    })
    if (import.meta.env.DEV) Object.assign(window, { __bmoScene: scene })
    return buildRig(scene, lcd)
  }, [scene, lcd])

  // ---- BMO's screen content: game console canvas + uploaded-video texture
  const gc = useMemo(() => new GameConsole(), [])
  const videoTex = useMemo(() => {
    const t = new VideoTexture(getFileVideo())
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  const lcdInfo = useMemo(() => {
    const m = scene.getObjectByName(sanitize('BMO_LCD')) as Mesh | undefined
    if (!m) return null
    m.geometry.computeBoundingBox()
    const b = m.geometry.boundingBox!
    // the exporter drops unused UV maps: rebuild planar UVs across the flat LCD panel
    const pos = m.geometry.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x)
      uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y)
    }
    m.geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    const c = b.getCenter(new Vector3())
    const k = 1.0 // cover the whole panel; the faceplate frame (drawn on top) does the cropping
    const corners = [
      [b.min.x, b.min.y], [b.max.x, b.min.y], [b.max.x, b.max.y], [b.min.x, b.max.y],
    ].map(([x, y]) => new Vector3(c.x + (x - c.x) * k, c.y + (y - c.y) * k, b.max.z))
    return { mesh: m, corners, aspect: (b.max.x - b.min.x) / (b.max.y - b.min.y) }
  }, [scene])
  useEffect(
    () =>
      input.onPress((b) => {
        if (useBmo.getState().screenMode === 'video') sfx.play(VIRTUAL_SOUND[b])
      }),
    [],
  )
  useEffect(() => {
    gc.onExit = () => useBmo.getState().setScreenMode('face')
    let prevReq = useBmo.getState().gameRequest?.id
    let prevMode = useBmo.getState().screenMode
    return useBmo.subscribe((s) => {
      if (s.gameRequest && s.gameRequest.id !== prevReq) {
        prevReq = s.gameRequest.id
        gc.start(s.gameRequest.index)
      } else if (s.screenMode === 'game' && prevMode !== 'game') gc.boot()
      prevMode = s.screenMode
    })
  }, [gc])

  // custom-property tracks exported from Blender (lid, face, eyes…)
  const tracks = useRef<Record<string, Track[]>>({})
  useEffect(() => {
    fetch(CLIPS_URL)
      .then((r) => r.json())
      .then((j: { clips: Record<string, ClipJson> }) => {
        for (const [name, c] of Object.entries(j.clips)) {
          tracks.current[name] = Object.entries(c.props)
            .filter(([, arr]) => Math.max(...arr) - Math.min(...arr) > 1e-3)
            .map(([k, arr]) => [k as PropName, arr])
        }
      })
      .catch(() => {})
  }, [])

  const live = useRef<Props>({ ...DEFAULT_PROPS })
  const scratch = useRef<Props>({ ...DEFAULT_PROPS })
  const press = useRef<Record<string, number>>({})
  const current = useRef<AnimationAction | null>(null)
  const currentName = useRef<ClipName>('Idle')
  const holdAt = useRef<number | undefined>(undefined)
  const spin = useRef({ drag: 0, turn: 0, down: false, x: 0, moved: false })

  // ---- clip playback (crossfades, hold-on-frame, back to Idle when done)
  const clip = useBmo((s) => s.clip)
  useEffect(() => {
    const a = actions[`BMO_${clip.name}`]
    if (!a) return
    holdAt.current = clip.holdAt
    if (current.current === a && currentName.current !== 'Idle') {
      a.paused = false // release a held pose
      return
    }
    a.reset()
    a.clampWhenFinished = true
    if (clip.name === 'Idle') a.setLoop(LoopRepeat, Infinity)
    else if (clip.name === 'Walk') a.setLoop(LoopRepeat, 3)
    else a.setLoop(LoopOnce, 1)
    a.fadeIn(0.3).play()
    if (current.current && current.current !== a) current.current.fadeOut(0.3)
    current.current = a
    currentName.current = clip.name
    useBmo.getState().setPlaying(clip.name)
    if (clip.name === 'Wave') sfx.play('hello')
    if (clip.name === 'Sit') window.setTimeout(() => sfx.play('plop'), 1050)
  }, [clip, actions])

  useEffect(() => {
    const onDone = (e: { action: AnimationAction }) => {
      if (e.action === current.current && currentName.current !== 'Idle') useBmo.getState().play('Idle')
    }
    mixer.addEventListener('finished', onDone)
    return () => mixer.removeEventListener('finished', onDone)
  }, [mixer])

  // ---- drag to rotate (horizontal), click vs drag disambiguation
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => Object.assign(spin.current, { down: true, x: e.clientX, moved: false })
    const move = (e: PointerEvent) => {
      const s = spin.current
      if (!s.down) return
      const dx = e.clientX - s.x
      if (Math.abs(dx) > 4) s.moved = true
      s.drag += dx * 0.01
      s.x = e.clientX
    }
    const up = () => {
      spin.current.down = false
      input.releaseAll()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl])

  // ---- hotspot anchors follow their (moving) nodes
  const anchors = useRef<(Group | null)[]>([])
  const hotspotNodes = useMemo(
    () =>
      HOTSPOTS.map((h) => {
        const node = scene.getObjectByName(sanitize(h.node))
        if (!node) return null
        scene.updateWorldMatrix(true, true)
        const c = new Box3().setFromObject(node).getCenter(new Vector3())
        return { node, local: node.worldToLocal(c) }
      }),
    [scene],
  )
  const [hotMode, setHotMode] = useState<'none' | 'open' | 'explode'>('none')
  const hotModeRef = useRef(hotMode)
  const tmp = useMemo(() => new Vector3(), [])
  const watches = useRef(makeWatches())
  const sound = useRef({ step: 0, talk: false, screen: true })
  const tmp2 = useMemo(() => new Vector3(), [])

  useFrame((state, dt) => {
    const st = useBmo.getState()
    const v = live.current
    const tgt = Object.assign(scratch.current, st.target)
    const a = current.current
    const name = currentName.current
    const preset = presetFor(st.section, state.size.width / state.size.height)

    if (a && holdAt.current !== undefined && a.time * FPS >= holdAt.current) a.paused = true

    // section choreography on top of the user's targets
    if (st.section === 'anatomy') {
      const p = scrollState.anatomy
      tgt.lid_open = smooth(0.04, 0.26, p) * (1 - smooth(0.5, 0.6, p))
      tgt.explode = smooth(0.56, 0.86, p)
    }
    const clipTracks = tracks.current[name]
    const clipUsesEyes = name !== 'Idle' && clipTracks?.some(([k]) => k === 'eye_look_x')
    if (preset.eyesFollow && !clipUsesEyes && !st.freeplay && st.screenMode === 'face') {
      tgt.eye_look_x = Math.max(-1, Math.min(1, state.pointer.x * 1.3 - preset.x * 0.35))
      tgt.eye_look_z = Math.max(-1, Math.min(1, state.pointer.y * 0.9))
    }
    for (const k of PROP_NAMES) easing.damp(v, k, tgt[k], 0.1, dt)

    // animation clip drives its own properties
    if (a && clipTracks) {
      const f = Math.max(0, a.time * FPS)
      for (const [k, arr] of clipTracks) {
        if (name === 'Idle' && k !== 'blink') continue
        const i = Math.min(arr.length - 1, Math.floor(f))
        const j = Math.min(arr.length - 1, i + 1)
        v[k] = arr[i] + (arr[j] - arr[i]) * (f - Math.floor(f))
      }
    }

    // ---- sounds driven by what BMO is actually doing
    for (const w of watches.current) {
      const x = v[w.prop]
      if (!w.state && x > w.on) {
        w.state = true
        if (w.up) sfx.play(w.up)
      } else if (w.state && x < w.off) {
        w.state = false
        if (w.down) sfx.play(w.down)
      }
    }
    const snd = sound.current
    const screenOn = tgt.screen_on > 0.3
    if (screenOn !== snd.screen) {
      snd.screen = screenOn
      sfx.play(screenOn ? 'powerOn' : 'powerOff')
    }
    if (name === 'Talk') {
      const talking = v.face_open > 0.5
      if (talking && !snd.talk) sfx.play('babble')
      snd.talk = talking
    }
    if (name === 'Walk' && a?.isRunning()) {
      const step = Math.floor((a.time * FPS) / 12)
      if (step !== snd.step) {
        snd.step = step
        sfx.play('step')
      }
    }

    for (const k in press.current) press.current[k] = Math.max(0, press.current[k] - dt * 5)
    for (const b of input.held()) press.current[sanitize(BTN_TO_MESH[b])] = 1

    // what's on BMO's screen
    const u = lcd.uniforms
    const screen = st.screenMode
    const youtubeOn = screen === 'video' && st.channel >= 0
    if (screen === 'game') {
      gc.update(dt)
      u.uMode.value = 1
      u.uMap.value = gc.texture
      u.uFit.value.set(1, 1)
    } else if (screen === 'video' && !youtubeOn) {
      const vid = getFileVideo()
      const va = (vid.videoWidth || 16) / (vid.videoHeight || 9)
      const la = lcdInfo?.aspect ?? 1.43
      u.uMode.value = st.upload ? 1 : 2
      u.uMap.value = videoTex
      u.uFit.value.set(va > la ? 1 : va / la, va > la ? la / va : 1)
    } else u.uMode.value = youtubeOn ? 3 : 0
    applyDrivers(rig, v, state.clock.elapsedTime, press.current, screen === 'face')

    // keep the YouTube player (behind the canvas) under BMO's screen
    const el = screenOverlay.el
    if (el) {
      if (youtubeOn && lcdInfo) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const c of lcdInfo.corners) {
          tmp2.copy(c).applyMatrix4(lcdInfo.mesh.matrixWorld).project(state.camera)
          const x = ((tmp2.x + 1) / 2) * state.size.width
          const y = ((1 - tmp2.y) / 2) * state.size.height
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`
        el.style.width = `${(x1 - x0).toFixed(1)}px`
        el.style.height = `${(y1 - y0).toFixed(1)}px`
        el.style.display = 'block'
      } else if (el.style.display !== 'none') el.style.display = 'none'
    }

    // staging + turntable + drag
    const sp = spin.current
    if (preset.turntable && !prefersReducedMotion) sp.turn += dt * 0.35
    else easing.damp(sp, 'turn', Math.round(sp.turn / (Math.PI * 2)) * Math.PI * 2, 0.5, dt)
    if (preset.locked) sp.drag = 0
    else if (!sp.down) easing.damp(sp, 'drag', 0, 2.5, dt)
    const lam = prefersReducedMotion ? 0.05 : 0.45
    easing.damp(outer.current.position, 'x', preset.x, lam, dt)
    const explodeTurn = st.section === 'anatomy' ? v.explode * 0.85 : 0
    easing.dampAngle(outer.current.rotation, 'y', preset.rotY + explodeTurn + sp.drag + sp.turn, lam, dt)

    // walk carries BMO forward, then eases back
    const w = walker.current
    if (name === 'Walk' && a?.isRunning()) w.position.z = Math.min(1.0, w.position.z + dt * 0.2)
    else easing.damp(w.position, 'z', 0, 0.8, dt)

    // hotspots
    let mode: 'none' | 'open' | 'explode' = 'none'
    if (st.section === 'anatomy') mode = v.explode > 0.85 ? 'explode' : v.lid_open > 0.85 ? 'open' : 'none'
    if (mode !== hotModeRef.current) {
      hotModeRef.current = mode
      setHotMode(mode)
    }
    if (mode !== 'none') {
      hotspotNodes.forEach((n, i) => {
        const g = anchors.current[i]
        if (n && g) g.position.copy(n.node.localToWorld(tmp.copy(n.local)))
      })
    }
  })

  // ---- interactions
  const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms)
  const dpadDir = (obj: Object3D, point: Vector3): Btn => {
    const m = obj as Mesh
    m.geometry.computeBoundingBox()
    const p = obj.worldToLocal(point.clone()).sub(m.geometry.boundingBox!.getCenter(new Vector3()))
    return Math.abs(p.x) > Math.abs(p.y) ? (p.x > 0 ? 'right' : 'left') : p.y > 0 ? 'up' : 'down'
  }
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (useBmo.getState().screenMode === 'face') return
    const obj = owner(e.object)
    const b = obj.name === sanitize('Btn_DPad') ? dpadDir(obj, e.point) : MESH_TO_BTN[obj.name]
    if (b) {
      e.stopPropagation()
      input.press(b)
    }
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (spin.current.moved) return
    e.stopPropagation()
    const obj = owner(e.object)
    const n = obj.name
    const s = useBmo.getState()
    if (s.screenMode !== 'face') return // buttons are a gamepad / remote right now
    const bs = BTN_SOUND[Object.keys(BTN_SOUND).find((k) => sanitize(k) === n) ?? '']
    if (bs) sfx.play(bs)
    if (n === sanitize('Btn_BlueDot') && (s.section === 'play' || s.section === 'tv')) {
      press.current[n] = 1
      s.setScreenMode(s.section === 'play' ? 'game' : 'video')
      return
    }
    if (n in rig.buttons) press.current[n] = 1
    switch (n) {
      case sanitize('Btn_DPad'): {
        const d = dpadDir(obj, e.point)
        s.setProps(d === 'left' || d === 'right' ? { eye_look_x: d === 'right' ? 1 : -1 } : { eye_look_z: d === 'up' ? 1 : -1 })
        later(1200, () => useBmo.getState().setProps({ eye_look_x: 0, eye_look_z: 0 }))
        return
      }
      case sanitize('Btn_Red'):
        s.setExpression('Laugh')
        later(1600, () => useBmo.getState().setExpression('Happy'))
        return
      case sanitize('Btn_Green'):
        s.setProps({ blink: 1 })
        later(160, () => useBmo.getState().setProps({ blink: 0 }))
        return
      case sanitize('Btn_Triangle'):
        s.setExpression('Surprised')
        later(1400, () => useBmo.getState().setExpression('Happy'))
        return
      case sanitize('Btn_BlueDot'):
        s.setProps({ screen_on: s.target.screen_on > 0.5 ? 0.04 : 1 })
        return
      case sanitize('Btn_Dashes'):
        s.play('Talk')
        return
      case sanitize('Int_Heart'):
        s.setProps({ eyes_happy: 1, face_open: 1, face_smile: 0 })
        later(1400, () => useBmo.getState().setExpression('Happy'))
        return
      case sanitize('BMO_BatteryDoor'):
      case sanitize('BMO_BatteryDoorHinge'):
        s.setProps({ back_open: s.target.back_open > 0.5 ? 0 : 1 })
        return
      case sanitize('BMO_Faceplate'):
        if (s.section !== 'hero' && s.section !== 'meet' && s.section !== 'anatomy') {
          s.setProps({ lid_open: s.target.lid_open > 0.5 ? 0 : 1 })
          return
        }
    }
    if (currentName.current === 'Idle') s.play('Wave')
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = '')

  const hotspot = useBmo((s) => s.hotspot)
  const setHotspot = useBmo((s) => s.setHotspot)

  return (
    <>
      <group ref={outer}>
        <group ref={walker}>
          <primitive object={scene} onClick={onClick} onPointerDown={onDown} onPointerOver={onOver} onPointerOut={onOut} />
          <mesh rotation-x={-Math.PI / 2} position-y={0.004} scale={[1.6, 1.25, 1]} renderOrder={-1}>
            <planeGeometry />
            <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
          </mesh>
        </group>
      </group>
      {HOTSPOTS.map((h, i) => {
        const visible = hotMode !== 'none' && (h.show === 'any' || h.show === hotMode || (h.show === 'open' && hotMode === 'explode'))
        return (
          <group key={h.id} ref={(g) => void (anchors.current[i] = g)}>
            {visible && (
              <Html center zIndexRange={[20, 0]} className="hotspot-wrap">
                <button
                  className={`hotspot ${hotspot === h.id ? 'active' : ''}`}
                  onClick={() => setHotspot(hotspot === h.id ? null : h.id)}
                  onMouseEnter={() => setHotspot(h.id)}
                  aria-label={h.title}
                >
                  <span className="dot" />
                  {hotspot === h.id && (
                    <span className="hotspot-card">
                      <strong>{h.title}</strong>
                      {h.text}
                    </span>
                  )}
                </button>
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}

useGLTF.preload(MODEL_URL, false, true)
