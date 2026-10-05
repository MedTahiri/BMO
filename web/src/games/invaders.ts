import { banner, C, H, oval, rect, sfx, text, W, type Ctx, type Game, type IO } from './kit'

/** Lumpy Space Invaders: one of the games BMO plays in the show. Lumpy invaders, oh my glob. */
export function createInvaders(): Game {
  type Inv = { x: number; y: number; alive: boolean }
  let px = W / 2
  let shots: { x: number; y: number }[] = []
  let bombs: { x: number; y: number }[] = []
  let invs: Inv[] = []
  let dir = 1
  let score = 0
  let lives = 3
  let wave = 1
  let over = false
  let t = 0
  let hitFlash = 0

  const newWave = () => {
    invs = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) invs.push({ x: 22 + c * 19, y: 16 + r * 13, alive: true })
    dir = 1
    shots = []
    bombs = []
  }

  return {
    id: 'invaders',
    title: 'LUMPY SPACE INVADERS',
    reset() {
      px = W / 2
      score = 0
      lives = 3
      wave = 1
      over = false
      newWave()
    },
    update(dt: number, io: IO) {
      t += dt
      hitFlash = Math.max(0, hitFlash - dt)
      if (over) {
        if (io.pressed('a') || io.pressed('start')) this.reset()
        return
      }
      px += ((io.held('right') ? 1 : 0) - (io.held('left') ? 1 : 0)) * 80 * dt
      px = Math.max(8, Math.min(W - 8, px))
      if ((io.pressed('a') || io.pressed('b')) && shots.length < 2) {
        shots.push({ x: px, y: 94 })
        sfx.play('shoot')
      }
      shots.forEach((s) => (s.y -= 170 * dt))
      shots = shots.filter((s) => s.y > 6)

      const alive = invs.filter((i) => i.alive)
      const speed = (16 + wave * 5) * (1 + (21 - alive.length) * 0.09)
      let edge = false
      for (const i of alive) {
        i.x += dir * speed * dt
        if (i.x < 8 || i.x > W - 8) edge = true
      }
      if (edge) {
        dir *= -1
        for (const i of alive) {
          i.y += 4
          i.x = Math.max(8, Math.min(W - 8, i.x))
        }
      }
      if (alive.length && Math.random() < dt * (0.9 + wave * 0.25)) {
        const s = alive[Math.floor(Math.random() * alive.length)]
        bombs.push({ x: s.x, y: s.y + 5 })
      }
      bombs.forEach((b) => (b.y += (52 + wave * 6) * dt))
      bombs = bombs.filter((b) => b.y < H)

      for (const s of shots)
        for (const i of alive)
          if (i.alive && Math.abs(s.x - i.x) < 7 && Math.abs(s.y - i.y) < 6) {
            i.alive = false
            s.y = -10
            score += 10 * wave
            sfx.play('invaderDie')
          }
      for (const b of bombs)
        if (Math.abs(b.x - px) < 7 && b.y > 92 && b.y < 102) {
          lives--
          bombs = []
          hitFlash = 0.5
          sfx.play('hurt')
          if (lives <= 0) {
            over = true
            sfx.play('gameOver')
          }
          break
        }
      if (!over && alive.some((i) => i.y > 88)) {
        over = true
        sfx.play('gameOver')
      }
      if (!invs.some((i) => i.alive)) {
        wave++
        sfx.play('waveClear')
        newWave()
      }
    },
    draw(g: Ctx) {
      rect(g, 0, 0, W, H, hitFlash > 0 && Math.floor(t * 20) % 2 ? C.l1 : C.l0)
      // stars
      for (let i = 0; i < 18; i++) rect(g, (i * 37) % W, (i * 23 + 7) % 90, 1, 1, C.l1)
      const frame = Math.floor(t * 3) % 2
      for (const i of invs) {
        if (!i.alive) continue
        // lumpy body with bumps (Lumpy Space style) + little star on top
        oval(g, i.x, i.y, 6, 4, C.d1)
        oval(g, i.x - 4, i.y - 2 + frame, 2.5, 2.5, C.d1)
        oval(g, i.x + 4, i.y - 2 - frame + 1, 2.5, 2.5, C.d1)
        oval(g, i.x, i.y + 3, 3, 2, C.d1)
        rect(g, i.x - 3, i.y - 1, 1, 2, C.d0)
        rect(g, i.x + 2, i.y - 1, 1, 2, C.d0)
        rect(g, i.x - 1, i.y - 7, 2, 2, C.l1)
      }
      shots.forEach((s) => rect(g, s.x - 0.5, s.y, 1, 4, C.d0))
      bombs.forEach((b) => {
        rect(g, b.x - 1, b.y, 2, 2, C.d1)
        rect(g, b.x, b.y + 2, 2, 2, C.d1)
      })
      // cannon
      rect(g, px - 6, 96, 12, 4, C.d0)
      rect(g, px - 1, 92, 2, 4, C.d0)
      rect(g, 0, 104, W, 1, C.d1)
      text(g, `SCORE ${score}`, 4, 108, C.d0, 6, 'left')
      text(g, `WAVE ${wave}`, W / 2, 108, C.d1, 6)
      for (let i = 0; i < lives; i++) rect(g, W - 8 - i * 7, 106, 5, 4, C.d0)
      if (over) banner(g, 'OH MY GLOB!', `SCORE ${score}`, Math.floor(t * 2) % 2 === 0)
    },
  }
}

