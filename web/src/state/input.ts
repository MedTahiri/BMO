/**
 * BMO's virtual gamepad. Fed by clicks on the 3D buttons and by the keyboard; read by the
 * games (held state + press edges) and by the TV remote logic. No React, no three.js.
 */
export type Btn = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'c' | 'start' | 'power'

type Listener = (b: Btn) => void
const held = new Set<Btn>()
const listeners = new Set<Listener>()

export const input = {
  isDown: (b: Btn) => held.has(b),
  held: () => held as ReadonlySet<Btn>,
  press(b: Btn) {
    if (held.has(b)) return
    held.add(b)
    listeners.forEach((l) => l(b))
  },
  release: (b: Btn) => void held.delete(b),
  releaseAll: () => held.clear(),
  onPress(l: Listener) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
}

/** 3D button mesh → virtual button (the D-pad direction comes from where it was clicked). */
export const MESH_TO_BTN: Record<string, Btn> = {
  Btn_Red: 'a',
  Btn_Green: 'b',
  Btn_Triangle: 'c',
  Btn_Dashes: 'start',
  Btn_BlueDot: 'power',
}
/** Which 3D mesh lights up for a virtual button. */
export const BTN_TO_MESH: Record<Btn, string> = {
  up: 'Btn_DPad', down: 'Btn_DPad', left: 'Btn_DPad', right: 'Btn_DPad',
  a: 'Btn_Red', b: 'Btn_Green', c: 'Btn_Triangle', start: 'Btn_Dashes', power: 'Btn_BlueDot',
}

const KEYS: Record<string, Btn> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', KeyC: 'c', KeyL: 'c',
  Enter: 'start', Escape: 'power', Backspace: 'power',
}

/** Keyboard → gamepad while `active()` is true (then the keys don't scroll the page). */
export function bindKeyboard(active: () => boolean) {
  const down = (e: KeyboardEvent) => {
    const b = KEYS[e.code]
    if (!b || !active() || e.target instanceof HTMLInputElement) return
    e.preventDefault()
    if (!e.repeat) input.press(b)
  }
  const up = (e: KeyboardEvent) => {
    const b = KEYS[e.code]
    if (b) input.release(b)
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', input.releaseAll)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', input.releaseAll)
  }
}
