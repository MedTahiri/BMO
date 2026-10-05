import type { Section } from '../state/bmoStore'

/** Per-section staging. Three.js space: Y up, BMO faces +Z, feet at y=0, ~1.9 tall. */
export interface Preset {
  cam: [number, number, number]
  look: [number, number, number]
  x: number // BMO sideways offset so the copy has room
  rotY: number
  turntable?: boolean
  locked?: boolean // no drag-rotate (BMO's screen is in use)
  eyesFollow?: boolean
}

export const PRESETS: Record<Section, Preset> = {
  hero: { cam: [0.5, 1.35, 6.4], look: [0, 1.0, 0], x: 1.05, rotY: -0.35, eyesFollow: true },
  meet: { cam: [0, 1.25, 6.2], look: [0, 1.0, 0], x: -1.05, rotY: 0.4, turntable: true },
  face: { cam: [0, 1.5, 3.9], look: [0, 1.35, 0], x: 0.55, rotY: -0.12, eyesFollow: true },
  anatomy: { cam: [1.5, 1.55, 4.9], look: [-0.15, 1.0, 0.4], x: -0.75, rotY: 0.32 },
  power: { cam: [0, 1.0, 4.7], look: [0, 0.85, 0], x: 0.7, rotY: Math.PI - 0.55 },
  play: { cam: [0, 1.25, 4.2], look: [0, 1.12, 0], x: -0.62, rotY: 0, locked: true },
  tv: { cam: [0, 1.3, 4.2], look: [0, 1.15, 0], x: 0.62, rotY: 0, locked: true },
  moves: { cam: [0, 0.9, 7.6], look: [0, 0.2, 0], x: 0, rotY: -0.3 },
  facts: { cam: [0, 1.0, 5.8], look: [0, 0.7, 0], x: 1.0, rotY: -0.4 },
  about: { cam: [0, 1.2, 6.4], look: [0, 0.95, 0], x: 1.45, rotY: -0.5, eyesFollow: true },
}

/** Narrow screens: centre BMO and pull the camera back. */
export function presetFor(section: Section, aspect: number): Preset {
  const p = PRESETS[section]
  if (aspect >= 0.9) return p
  // copy sits in a bottom sheet, so frame BMO in the upper half
  const k = 1.9
  return {
    ...p,
    x: 0,
    cam: [p.cam[0] * 0.5, p.cam[1] + 0.1, p.cam[2] * k],
    look: [0, p.look[1] - 0.75, p.look[2]],
  }
}
