/**
 * BMO's sound effects: synthesised on the fly with the Web Audio API (no audio files, ~0 KB).
 *
 * Real recordings: list files in public/sounds/sounds.json, e.g.
 *   { "hello": "hello.mp3", "laugh": ["laugh1.mp3", "laugh2.mp3"] }
 * Any sound named there plays the recording (a random one if several) instead of the synth.
 * Only add audio you have the right to use.
 * The AudioContext is created lazily and unlocked on the first user gesture (browser autoplay rules).
 */
type Wave = OscillatorType

const STORE_KEY = 'bmo-sound'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let enabled = readPref()
const listeners = new Set<(on: boolean) => void>()

// ---- optional real recordings (public/sounds/sounds.json)
const SOUND_DIR = `${import.meta.env.BASE_URL}sounds/`
let manifest: Record<string, string[]> = {}
const buffers = new Map<string, Promise<AudioBuffer | null>>()
if (typeof window !== 'undefined') {
  fetch(`${SOUND_DIR}sounds.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: Record<string, string | string[]>) => {
      manifest = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]))
    })
    .catch(() => {})
}

function loadBuffer(c: AudioContext, file: string) {
  let p = buffers.get(file)
  if (!p) {
    p = fetch(SOUND_DIR + file)
      .then((r) => r.arrayBuffer())
      .then((a) => c.decodeAudioData(a))
      .catch(() => null)
    buffers.set(file, p)
  }
  return p
}

/** Play a recording for `name` if one is listed; returns false to fall back to the synth. */
function playRecording(name: string): boolean {
  const files = manifest[name]
  const c = ensure()
  if (!files?.length || !c || !master) return false
  const file = files[Math.floor(Math.random() * files.length)]
  void loadBuffer(c, file).then((buf) => {
    if (!buf || !master || !enabled) return
    const src = c.createBufferSource()
    const g = c.createGain()
    g.gain.value = 1.6 // recordings are usually quieter than the synth master level
    src.buffer = buf
    src.connect(g).connect(master)
    src.start()
  })
  return true
}

/** Decode all listed recordings once audio is unlocked, so the first play has no delay. */
function preload() {
  const c = ensure()
  if (c) for (const files of Object.values(manifest)) files.forEach((f) => void loadBuffer(c, f))
}

function readPref() {
  try {
    return localStorage.getItem(STORE_KEY) !== 'off'
  } catch {
    return true
  }
}

function ensure(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return ctx.state === 'running' ? ctx : null
}

/** Unlock audio on the first gesture. */
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!enabled) return
    ensure()
    void ctx?.resume()?.then(preload)
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, { passive: true })
}

function tone(freq: number, dur: number, type: Wave = 'square', vol = 0.15, slideTo?: number, delay = 0) {
  const c = ensure()
  if (!c || !master) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol = 0.12, filter: BiquadFilterType = 'lowpass', f0 = 1200, f1?: number, delay = 0) {
  const c = ensure()
  if (!c || !master || !noiseBuf) return
  const t = c.currentTime + delay
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const bq = c.createBiquadFilter()
  bq.type = filter
  bq.frequency.setValueAtTime(f0, t)
  if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(bq).connect(g).connect(master)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

const seq = (notes: number[], step: number, dur: number, type: Wave = 'square', vol = 0.12) =>
  notes.forEach((f, i) => tone(f, dur, type, vol, undefined, i * step))

const RECIPES = {
  // --- BMO's buttons
  btn_red: () => tone(660, 0.06, 'square', 0.12),
  btn_green: () => tone(880, 0.06, 'square', 0.12),
  btn_triangle: () => tone(990, 0.06, 'square', 0.12),
  btn_dpad: () => tone(520, 0.05, 'square', 0.1),
  btn_dashes: () => tone(440, 0.05, 'square', 0.1),
  btn_blue: () => tone(330, 0.07, 'square', 0.1),
  ui: () => tone(1200, 0.035, 'square', 0.06, 900),
  // --- BMO's voice (cute chiptune chirps)
  hello: () => seq([880, 1320, 1760], 0.08, 0.07, 'square', 0.1),
  laugh: () => seq([660, 880, 1100, 880, 1320], 0.06, 0.05, 'square', 0.1),
  surprise: () => tone(420, 0.2, 'triangle', 0.18, 1300),
  sad: () => {
    tone(640, 0.55, 'triangle', 0.16, 240)
    tone(320, 0.55, 'sine', 0.08, 120)
  },
  babble: () => tone(480 + Math.random() * 520, 0.055, 'square', 0.06, 380 + Math.random() * 400),
  blink: () => tone(2200, 0.018, 'sine', 0.05),
  plop: () => tone(220, 0.2, 'sine', 0.3, 60),
  step: () => noise(0.035, 0.07, 'lowpass', 700),
  // --- mechanics
  lidOpen: () => {
    noise(0.04, 0.2, 'bandpass', 2400)
    tone(190, 0.32, 'triangle', 0.07, 120, 0.03)
  },
  lidClose: () => {
    noise(0.05, 0.22, 'bandpass', 1800)
    tone(130, 0.14, 'sine', 0.25, 55)
  },
  doorOpen: () => {
    noise(0.03, 0.18, 'highpass', 3000)
    tone(320, 0.12, 'triangle', 0.08, 210, 0.02)
  },
  doorClose: () => noise(0.04, 0.22, 'bandpass', 2600),
  explode: () => {
    noise(0.7, 0.3, 'lowpass', 3200, 180)
    tone(90, 0.5, 'sine', 0.3, 38)
  },
  assemble: () => noise(0.45, 0.18, 'lowpass', 200, 3200),
  cartridge: () => {
    noise(0.04, 0.2, 'bandpass', 2000)
    tone(150, 0.09, 'sine', 0.3, 90, 0.02)
  },
  powerOn: () => tone(300, 0.16, 'sine', 0.16, 900),
  powerOff: () => tone(900, 0.22, 'sine', 0.16, 180),
  boot: () => seq([523, 659, 784, 1047], 0.09, 0.08, 'square', 0.1),
  // --- games
  menuMove: () => tone(1000, 0.03, 'square', 0.07),
  select: () => seq([660, 990], 0.07, 0.06, 'square', 0.1),
  pause: () => seq([440, 330], 0.08, 0.07, 'square', 0.09),
  jump: () => tone(300, 0.11, 'square', 0.1, 620),
  sword: () => noise(0.07, 0.14, 'highpass', 2500),
  hit: () => tone(220, 0.09, 'square', 0.13, 110),
  hurt: () => tone(320, 0.28, 'sawtooth', 0.1, 70),
  combo: () => seq([784, 988, 1319], 0.045, 0.05, 'square', 0.1),
  bossDown: () => seq([988, 784, 659, 523, 392], 0.07, 0.07, 'square', 0.11),
  shoot: () => tone(900, 0.07, 'square', 0.07, 380),
  invaderDie: () => noise(0.13, 0.16, 'bandpass', 1400, 300),
  squash: () => {
    noise(0.07, 0.18, 'lowpass', 1800)
    tone(180, 0.07, 'square', 0.08, 90)
  },
  coin: () => seq([988, 1319], 0.07, 0.09, 'square', 0.1),
  miss: () => tone(150, 0.07, 'square', 0.07),
  escape: () => tone(500, 0.16, 'triangle', 0.1, 220),
  win: () => seq([523, 659, 784, 1047, 1319], 0.11, 0.12, 'square', 0.11),
  gameOver: () => seq([392, 330, 262, 196], 0.16, 0.16, 'triangle', 0.15),
  waveClear: () => seq([784, 1047, 1319], 0.08, 0.08, 'square', 0.1),
} as const

export type SfxName = keyof typeof RECIPES

const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  babble: 380, hello: 900, laugh: 900, surprise: 600, sad: 900, plop: 500, powerOn: 500, powerOff: 500,
}
const lastPlayed = new Map<SfxName, number>()

export const sfx = {
  play(name: SfxName) {
    if (!enabled) return
    // voice lines must not pile up (e.g. chatter while talking, repeated laughs)
    const now = performance.now()
    const gap = MIN_GAP_MS[name] ?? 0
    if (gap && now - (lastPlayed.get(name) ?? -1e9) < gap) return
    lastPlayed.set(name, now)
    if (!playRecording(name)) RECIPES[name]()
  },
  /** Names that can be given a real recording in public/sounds/sounds.json. */
  names: () => Object.keys(RECIPES) as SfxName[],
  get enabled() {
    return enabled
  },
  setEnabled(on: boolean) {
    enabled = on
    try {
      localStorage.setItem(STORE_KEY, on ? 'on' : 'off')
    } catch {
      /* private mode */
    }
    if (on) {
      ensure()
      void ctx?.resume()
      RECIPES.ui()
    } else void ctx?.suspend()
    listeners.forEach((l) => l(on))
  },
  subscribe(l: (on: boolean) => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
}
