import { banner, C, H, oval, rand, rect, sfx, text, W, type Ctx, type Game, type IO } from './kit'

/**
 * Bug Battle: another game BMO plays in the show. Bugs pop out of nine holes; move with the
 * D-pad and squash them with red before they escape. Gold bugs are worth more.
 */
const COLS = [40, 80, 120]
const ROWS = [34, 60, 86]

export function createBugBattle(): Game {
  type Bug = { t: number; life: number; gold: boolean } | null
  let holes: Bug[] = Array(9).fill(null)
  let splats: { i: number; t: number }[] = []
  let cur = 4
  let score = 0
  let lives = 3
  let spawnT = 1
  let missT = 0
  let over = false
  let t = 0

  const lifetime = () => Math.max(0.75, 1.9 - score / 450)

  return {
    id: 'bugbattle',
    title: 'BUG BATTLE',
    reset() {
      holes = Array(9).fill(null)
      splats = []
      cur = 4
      score = 0
      lives = 3
      spawnT = 1
      over = false
    },
    update(dt: number, io: IO) {
      t += dt
      missT = Math.max(0, missT - dt)
      splats.forEach((s) => (s.t -= dt))
      splats = splats.filter((s) => s.t > 0)
      if (over) {
        if (io.pressed('a') || io.pressed('start')) this.reset()
        return
      }
      const c = cur % 3
      const r = Math.floor(cur / 3)
      if (io.pressed('left') || io.pressed('right') || io.pressed('up') || io.pressed('down')) sfx.play('menuMove')
      if (io.pressed('left')) cur = r * 3 + Math.max(0, c - 1)
      if (io.pressed('right')) cur = r * 3 + Math.min(2, c + 1)
      if (io.pressed('up')) cur = Math.max(0, r - 1) * 3 + c
      if (io.pressed('down')) cur = Math.min(2, r + 1) * 3 + c
      if (io.pressed('a') || io.pressed('b')) {
        const bug = holes[cur]
        if (bug) {
          score += bug.gold ? 50 : 10
          sfx.play(bug.gold ? 'coin' : 'squash')
          holes[cur] = null
          splats.push({ i: cur, t: 0.35 })
        } else {
          missT = 0.15
          sfx.play('miss')
        }
      }
      spawnT -= dt
      if (spawnT <= 0) {
        const empty = holes.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0)
        if (empty.length) {
          const life = lifetime()
          holes[empty[Math.floor(Math.random() * empty.length)]] = { t: life, life, gold: Math.random() < 0.1 }
        }
        spawnT = rand(0.35, 0.8) * lifetime()
      }
      holes = holes.map((h) => {
        if (!h) return null
        h.t -= dt
        if (h.t <= 0) {
          lives--
          sfx.play('escape')
          if (lives <= 0) {
            over = true
            sfx.play('gameOver')
          }
          return null
        }
        return h
      })
    },
    draw(g: Ctx) {
      rect(g, 0, 0, W, H, missT > 0 ? C.l1 : C.l0)
      text(g, 'BUG BATTLE', W / 2, 9, C.d1, 7)
      holes.forEach((h, i) => {
        const x = COLS[i % 3]
        const y = ROWS[Math.floor(i / 3)]
        oval(g, x, y + 4, 13, 5, C.d1)
        oval(g, x, y + 4, 10, 3, C.d0)
        if (h) {
          const rise = Math.min(1, (h.life - h.t) * 6, h.t * 6) * 6
          const by = y + 2 - rise
          const leg = Math.floor(t * 10) % 2
          g.fillStyle = C.d0
          for (let k = -1; k <= 1; k++) {
            rect(g, x - 9, by + k * 2 + leg, 4, 1, C.d0)
            rect(g, x + 5, by + k * 2 - leg, 4, 1, C.d0)
          }
          oval(g, x, by, 6, 4, h.gold ? C.l1 : C.d0)
          if (h.gold) {
            g.strokeStyle = C.d0
            g.lineWidth = 1
            g.beginPath()
            g.ellipse(x, by, 6, 4, 0, 0, Math.PI * 2)
            g.stroke()
          }
          rect(g, x - 3, by - 6, 1, 3, C.d0)
          rect(g, x + 2, by - 6, 1, 3, C.d0)
          rect(g, x - 2, by - 1, 1, 1, C.l0)
          rect(g, x + 1, by - 1, 1, 1, C.l0)
        }
      })
      for (const s of splats) {
        const x = COLS[s.i % 3]
        const y = ROWS[Math.floor(s.i / 3)]
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3
          rect(g, x + Math.cos(a) * (10 - s.t * 12), y + Math.sin(a) * (6 - s.t * 8), 2, 2, C.d1)
        }
      }
      // cursor (blinking bracket)
      const cx = COLS[cur % 3]
      const cy = ROWS[Math.floor(cur / 3)]
      if (Math.floor(t * 4) % 2 === 0 || over) {
        g.strokeStyle = C.d0
        g.lineWidth = 1.5
        g.strokeRect(cx - 16, cy - 12, 32, 22)
      }
      text(g, `SCORE ${score}`, 4, 106, C.d0, 6, 'left')
      for (let i = 0; i < lives; i++) rect(g, W - 8 - i * 7, 103, 5, 5, C.d0)
      if (over) banner(g, 'THE BUGS WON', `SCORE ${score}`, Math.floor(t * 2) % 2 === 0)
    },
  }
}
