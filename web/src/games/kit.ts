import type { Btn } from '../state/input'
export { sfx } from '../audio/sfx'

/** Logical resolution of BMO's LCD (drawn at 2x for crisper text). Same aspect as the screen. */
export const W = 160
export const H = 112

/** Four-shade Game Boy palette tuned to BMO's screen green. */
export const C = { d0: '#0e3a28', d1: '#2c7a55', l1: '#8dd7a6', l0: '#c4f7cf' } as const

export interface IO {
  held(b: Btn): boolean
  pressed(b: Btn): boolean
}

export interface Game {
  id: string
  title: string
  reset(): void
  update(dt: number, io: IO): void
  draw(g: CanvasRenderingContext2D): void
}

export type Ctx = CanvasRenderingContext2D

export const rect = (g: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c
  g.fillRect(Math.round(x), Math.round(y), w, h)
}

export const oval = (g: Ctx, x: number, y: number, rx: number, ry: number, c: string) => {
  g.fillStyle = c
  g.beginPath()
  g.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2)
  g.fill()
}

export function text(g: Ctx, s: string, x: number, y: number, c: string = C.d0, size = 8, align: CanvasTextAlign = 'center') {
  g.fillStyle = c
  g.font = `bold ${size}px ui-monospace, "SFMono-Regular", Menlo, monospace`
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(s, x, y)
}

export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Shared "game over / you win" card. */
export function banner(g: Ctx, title: string, sub: string, blink: boolean) {
  rect(g, 18, 34, W - 36, 44, C.l0)
  g.strokeStyle = C.d0
  g.lineWidth = 2
  g.strokeRect(19, 35, W - 38, 42)
  text(g, title, W / 2, 47, C.d0, 10)
  text(g, sub, W / 2, 59, C.d1, 7)
  if (blink) text(g, 'PRESS RED', W / 2, 70, C.d0, 6)
}
