import { create } from 'zustand'

/** Mirrors PROPS in bmo_build.py (names, defaults, ranges). */
export const PROP_SPECS = {
  lid_open: { def: 0, min: 0, max: 1, label: 'Faceplate open' },
  explode: { def: 0, min: 0, max: 1, label: 'Exploded view' },
  back_open: { def: 0, min: 0, max: 1, label: 'Battery door' },
  screen_on: { def: 1, min: 0, max: 3, label: 'Screen brightness' },
  face_smile: { def: 1, min: 0, max: 1, label: 'Smile' },
  face_open: { def: 0, min: 0, max: 1, label: 'Open grin' },
  face_frown: { def: 0, min: 0, max: 1, label: 'Frown' },
  face_surprise: { def: 0, min: 0, max: 1, label: 'Surprise' },
  blink: { def: 0, min: 0, max: 1, label: 'Blink' },
  eye_look_x: { def: 0, min: -1, max: 1, label: 'Look left/right' },
  eye_look_z: { def: 0, min: -1, max: 1, label: 'Look down/up' },
  eyes_happy: { def: 0, min: 0, max: 1, label: 'Happy eyes ^ ^' },
  cartridge_insert: { def: 0, min: 0, max: 1, label: 'Cartridge' },
} as const

export type PropName = keyof typeof PROP_SPECS
export type Props = Record<PropName, number>
export const PROP_NAMES = Object.keys(PROP_SPECS) as PropName[]
export const DEFAULT_PROPS = Object.fromEntries(PROP_NAMES.map((k) => [k, PROP_SPECS[k].def])) as Props

export const CLIP_NAMES = ['Idle', 'Wave', 'Walk', 'Talk', 'OpenLid', 'BatteryDoor', 'Explode', 'PlayGame', 'Sit', 'Sad'] as const
export type ClipName = (typeof CLIP_NAMES)[number]

export const SECTIONS = ['hero', 'meet', 'face', 'anatomy', 'power', 'play', 'tv', 'moves', 'facts', 'about'] as const
export type Section = (typeof SECTIONS)[number]

const FACE_KEYS: PropName[] = ['face_smile', 'face_open', 'face_frown', 'face_surprise', 'blink', 'eyes_happy', 'eye_look_z', 'screen_on']

export const EXPRESSIONS: Record<string, Partial<Props>> = {
  Happy: { face_smile: 1 },
  Grin: { face_open: 1 },
  Laugh: { face_open: 1, eyes_happy: 1 },
  Surprised: { face_surprise: 1 },
  Sad: { face_frown: 1, eye_look_z: -0.7, screen_on: 0.6 },
  Sleepy: { face_smile: 0.4, blink: 0.85, screen_on: 0.7 },
  Neutral: {},
}

export interface ClipRequest {
  name: ClipName
  id: number
  holdAt?: number // frame to pause on (e.g. stay seated)
}

export type ScreenMode = 'face' | 'game' | 'video'
export interface Upload {
  url: string
  name: string
}

interface BmoState {
  screenMode: ScreenMode
  gameRequest: { index: number; id: number } | null
  channel: number // index into TV_CHANNELS, or -1 for the uploaded video
  upload: Upload | null
  osd: { text: string; id: number } | null
  setScreenMode: (m: ScreenMode) => void
  requestGame: (index: number) => void
  setChannel: (c: number) => void
  setUpload: (u: Upload | null) => void
  showOsd: (text: string) => void
  target: Props
  section: Section
  clip: ClipRequest
  playing: ClipName
  hotspot: string | null
  loaded: number // 0..100
  freeplay: boolean
  setProps: (p: Partial<Props>) => void
  setExpression: (name: string) => void
  reset: () => void
  play: (name: ClipName, holdAt?: number) => void
  release: () => void
  setPlaying: (n: ClipName) => void
  setSection: (s: Section) => void
  setHotspot: (h: string | null) => void
  setLoaded: (n: number) => void
  toggleFreeplay: () => void
}

let clipId = 0

let osdId = 0
let gameId = 0

export const useBmo = create<BmoState>((set, get) => ({
  screenMode: 'face',
  gameRequest: null,
  channel: 0,
  upload: null,
  osd: null,
  setScreenMode: (m) => set({ screenMode: m }),
  requestGame: (index) => set({ gameRequest: { index, id: ++gameId }, screenMode: 'game' }),
  setChannel: (c) => set({ channel: c }),
  setUpload: (u) => {
    const old = get().upload
    if (old && old.url !== u?.url) URL.revokeObjectURL(old.url)
    set({ upload: u, channel: u ? -1 : 0 })
  },
  showOsd: (text) => set({ osd: { text, id: ++osdId } }),
  target: { ...DEFAULT_PROPS },
  section: 'hero',
  clip: { name: 'Idle', id: 0 },
  playing: 'Idle',
  hotspot: null,
  loaded: 0,
  freeplay: false,
  setProps: (p) => set({ target: { ...get().target, ...p } }),
  setExpression: (name) => {
    const base: Partial<Props> = {}
    for (const k of FACE_KEYS) base[k] = DEFAULT_PROPS[k]
    base.face_smile = 0
    set({ target: { ...get().target, ...base, ...(EXPRESSIONS[name] ?? {}) } })
  },
  reset: () => set({ target: { ...DEFAULT_PROPS } }),
  play: (name, holdAt) => set({ clip: { name, id: ++clipId, holdAt } }),
  release: () => {
    const c = get().clip
    if (c.holdAt !== undefined) set({ clip: { ...c, holdAt: undefined, id: c.id } })
  },
  setPlaying: (n) => set({ playing: n }),
  setSection: (s) => set({ section: s }),
  setHotspot: (h) => set({ hotspot: h }),
  setLoaded: (n) => set({ loaded: n }),
  toggleFreeplay: () => set({ freeplay: !get().freeplay }),
}))

/** Non-reactive scroll data (read every frame by the 3D scene, never re-renders React). */
export const scrollState = { anatomy: 0, footer: 0, footerTop: 0 }

export const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
