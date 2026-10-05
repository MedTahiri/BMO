import { banner, C, H, overlap, oval, rect, sfx, text, W, type Ctx, type Game, type IO } from './kit'

/**
 * Guardians of Sunshine: the side-scroller BMO plays in season 2. Finn has to beat the
 * game's three bosses: Bouncy Bee, Hunny Bunny and Sleepy Sam the toad.
 * Red = jump, green = sword. Attack while in the air for a COMBO (double damage).
 */
const GROUND = 100
const PLATS = [
  { x: 12, y: 74, w: 36 },
  { x: 112, y: 74, w: 36 },
  { x: 60, y: 52, w: 40 },
]
const BOSSES = [
  { name: 'BOUNCY BEE', hp: 6, w: 14, h: 10 },
  { name: 'HUNNY BUNNY', hp: 7, w: 12, h: 12 },
  { name: 'SLEEPY SAM', hp: 9, w: 18, h: 12 },
]

export function createGuardians(): Game {
  const p = { x: 24, y: GROUND - 12, vx: 0, vy: 0, w: 8, h: 12, face: 1, ground: true, hp: 3, inv: 0, atk: 0, combo: false }
  const b = { i: 0, x: 120, y: 40, vx: 48, vy: 36, w: 14, h: 10, hp: 6, inv: 0, t: 0, asleep: false, leaps: 0, ground: false }
  let score = 0
  let state: 'play' | 'over' | 'win' = 'play'
  let bannerT = 0
  let comboT = 0
  let t = 0

  const spawnBoss = (i: number) => {
    const d = BOSSES[i]
    Object.assign(b, { i, w: d.w, h: d.h, hp: d.hp, inv: 0, t: 1.2, asleep: i === 2, leaps: 0, vx: 48, vy: 36 })
    b.x = 118
    b.y = i === 0 ? 30 : GROUND - d.h
    bannerT = 1.6
  }

  const landOn = (o: { x: number; y: number; w: number; h: number; vy: number }, prevBottom: number) => {
    if (o.y + o.h >= GROUND) {
      o.y = GROUND - o.h
      o.vy = 0
      return true
    }
    if (o.vy >= 0)
      for (const pl of PLATS)
        if (prevBottom <= pl.y && o.y + o.h >= pl.y && o.x + o.w > pl.x && o.x < pl.x + pl.w) {
          o.y = pl.y - o.h
          o.vy = 0
          return true
        }
    return false
  }

  return {
    id: 'guardians',
    title: 'GUARDIANS OF SUNSHINE',
    reset() {
      Object.assign(p, { x: 24, y: GROUND - 12, vx: 0, vy: 0, face: 1, hp: 3, inv: 0, atk: 0 })
      score = 0
      state = 'play'
      spawnBoss(0)
    },
    update(dt: number, io: IO) {
      t += dt
      comboT = Math.max(0, comboT - dt)
      if (state !== 'play') {
        if (io.pressed('a') || io.pressed('start')) this.reset()
        return
      }
      if (bannerT > 0) {
        bannerT -= dt
        return
      }
      // --- Finn
      const dir = (io.held('right') ? 1 : 0) - (io.held('left') ? 1 : 0)
      if (dir) p.face = dir
      p.vx = dir * 62
      if (io.pressed('a') && p.ground) {
        p.vy = -168
        sfx.play('jump')
      }
      if (io.pressed('b') && p.atk <= 0) {
        p.atk = 0.22
        p.combo = !p.ground
        sfx.play('sword')
        if (p.combo) comboT = 0.6
      }
      p.atk -= dt
      p.inv -= dt
      const prev = p.y + p.h
      p.vy += 430 * dt
      p.x = Math.max(0, Math.min(W - p.w, p.x + p.vx * dt))
      p.y += p.vy * dt
      p.ground = landOn(p, prev)

      // --- boss AI
      b.inv -= dt
      b.t -= dt
      const rage = 1 + (1 - b.hp / BOSSES[b.i].hp) * 0.8
      if (b.i === 0) {
        b.x += b.vx * rage * dt
        b.y += b.vy * rage * dt
        if (b.x < 4 || b.x > W - b.w - 4) b.vx *= -1
        if (b.y < 12 || b.y > GROUND - b.h) b.vy *= -1
      } else {
        if (b.i === 2 && b.asleep) {
          if (b.t <= 0) {
            b.asleep = false
            b.leaps = 2
            b.t = 0.3
          }
        } else if (b.t <= 0 && b.ground) {
          b.vy = b.i === 2 ? -150 : -175
          b.vx = Math.sign(p.x - b.x || 1) * (b.i === 2 ? 70 : 55) * rage
          b.t = b.i === 2 ? 0.5 : 1.0
          if (b.i === 2 && --b.leaps < 0) {
            b.asleep = true
            b.t = 2.2
            b.vy = 0
            b.vx = 0
          }
        }
        const bp = b.y + b.h
        b.vy += 430 * dt
        b.x = Math.max(2, Math.min(W - b.w - 2, b.x + b.vx * dt))
        b.y += b.vy * dt
        b.ground = landOn(b, bp)
        if (b.ground) b.vx *= 0.85
      }

      // --- sword hits
      if (p.atk > 0 && b.inv <= 0) {
        const hit = { x: p.face > 0 ? p.x + p.w : p.x - 13, y: p.y + 2, w: 13, h: 8 }
        if (overlap(hit, b)) {
          const dmg = (p.combo ? 2 : 1) * (b.i === 2 && b.asleep ? 2 : 1)
          b.hp -= dmg
          b.inv = 0.35
          score += 100 * dmg
          sfx.play(p.combo ? 'combo' : 'hit')
          if (b.hp <= 0) {
            score += 500
            if (b.i === 2) {
              state = 'win'
              sfx.play('win')
            } else {
              sfx.play('bossDown')
              spawnBoss(b.i + 1)
            }
          }
        }
      }
      // --- contact damage
      if (p.inv <= 0 && overlap(p, b) && !(b.i === 2 && b.asleep)) {
        p.hp--
        p.inv = 1.2
        p.vy = -110
        p.x += (p.x < b.x ? -14 : 14)
        sfx.play('hurt')
        if (p.hp <= 0) {
          state = 'over'
          sfx.play('gameOver')
        }
      }
    },
    draw(g: Ctx) {
      rect(g, 0, 0, W, H, C.l0)
      // the sunshine
      oval(g, 138, 16, 9, 9, C.l1)
      for (let k = 0; k < 8; k++) {
        const a = k * (Math.PI / 4) + t * 0.6
        rect(g, 138 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, 2, 2, C.l1)
      }
      for (const pl of PLATS) {
        rect(g, pl.x, pl.y, pl.w, 4, C.d1)
        rect(g, pl.x, pl.y + 4, pl.w, 1, C.d0)
      }
      rect(g, 0, GROUND, W, H - GROUND, C.d1)
      for (let x = 0; x < W; x += 8) rect(g, x, GROUND, 4, 1, C.l1)

      // boss
      if (!(b.inv > 0 && Math.floor(t * 24) % 2)) {
        if (b.i === 0) {
          const flap = Math.floor(t * 12) % 2
          oval(g, b.x + 4, b.y - 1 - flap, 4, 3, C.l1)
          oval(g, b.x + 10, b.y - 1 - flap, 4, 3, C.l1)
          oval(g, b.x + 7, b.y + 5, 7, 5, C.d1)
          rect(g, b.x + 4, b.y + 1, 2, 8, C.d0)
          rect(g, b.x + 9, b.y + 1, 2, 8, C.d0)
          rect(g, b.x + 12, b.y + 3, 2, 2, C.l0)
        } else if (b.i === 1) {
          rect(g, b.x + 2, b.y - 8, 3, 9, C.d1)
          rect(g, b.x + 7, b.y - 8, 3, 9, C.d1)
          oval(g, b.x + 6, b.y + 7, 6, 6, C.d1)
          rect(g, b.x + 3, b.y + 4, 2, 2, C.l0)
          rect(g, b.x + 8, b.y + 4, 2, 2, C.l0)
        } else {
          oval(g, b.x + 9, b.y + 7, 9, 6, C.d1)
          oval(g, b.x + 4, b.y + 2, 3, 3, C.d1)
          oval(g, b.x + 14, b.y + 2, 3, 3, C.d1)
          if (b.asleep) {
            rect(g, b.x + 2, b.y + 2, 4, 1, C.d0)
            rect(g, b.x + 12, b.y + 2, 4, 1, C.d0)
            text(g, 'z', b.x + 20, b.y - 4 - (t * 6) % 6, C.d1, 7)
          } else {
            rect(g, b.x + 3, b.y + 1, 2, 2, C.l0)
            rect(g, b.x + 13, b.y + 1, 2, 2, C.l0)
          }
          rect(g, b.x + 5, b.y + 9, 8, 1, C.d0)
        }
      }
      // Finn (white hat with ears, blue shirt → palette shades)
      if (!(p.inv > 0 && Math.floor(t * 20) % 2)) {
        rect(g, p.x, p.y, p.w, 5, C.l0)
        g.strokeStyle = C.d0
        g.lineWidth = 1
        g.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, p.w - 1, 5)
        rect(g, p.x + 1, p.y - 2, 2, 2, C.d0)
        rect(g, p.x + 5, p.y - 2, 2, 2, C.d0)
        rect(g, p.x + 2, p.y + 2, 4, 2, C.l1)
        rect(g, p.x + (p.face > 0 ? 4 : 2), p.y + 2, 1, 1, C.d0)
        rect(g, p.x + 1, p.y + 6, 6, 4, C.d1)
        rect(g, p.x + 1, p.y + 10, 2, 2, C.d0)
        rect(g, p.x + 5, p.y + 10, 2, 2, C.d0)
        if (p.atk > 0) rect(g, p.face > 0 ? p.x + p.w : p.x - 11, p.y + 6, 11, 2, C.d0)
      }
      // HUD
      for (let i = 0; i < 3; i++) rect(g, 4 + i * 7, 4, 5, 5, i < p.hp ? C.d0 : C.l1)
      text(g, `${score}`, 4, 15, C.d1, 6, 'left')
      const d = BOSSES[b.i]
      text(g, d.name, W - 4, 6, C.d0, 6, 'right')
      rect(g, W - 54, 11, 50, 3, C.l1)
      rect(g, W - 54, 11, Math.max(0, (50 * b.hp) / d.hp), 3, C.d0)
      if (comboT > 0) text(g, 'COMBO!', p.x + 4, p.y - 8, C.d0, 7)
      if (bannerT > 0 && state === 'play') {
        rect(g, 0, 42, W, 24, C.d0)
        text(g, `BOSS ${b.i + 1}: ${d.name}`, W / 2, 54, C.l0, 8)
      }
      if (state === 'over') banner(g, 'GAME OVER', `SCORE ${score}`, Math.floor(t * 2) % 2 === 0)
      if (state === 'win') banner(g, 'YOU WIN!', 'GUARDIANS OF SUNSHINE', Math.floor(t * 2) % 2 === 0)
    },
  }
}
