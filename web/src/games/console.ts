import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { input, type Btn } from '../state/input'
import { sfx } from '../audio/sfx'
import { createBugBattle } from './bugbattle'
import { createGuardians } from './guardians'
import { createInvaders } from './invaders'
import { C, H, rect, text, W, type Game, type IO } from './kit'

export const GAMES: Game[] = [createGuardians(), createInvaders(), createBugBattle()]

/**
 * BMO's game console: boot screen, game menu, pause, and the active game, all drawn into a
 * canvas that is used as the LCD texture. Driven by the virtual gamepad.
 */
export class GameConsole {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  private g: CanvasRenderingContext2D
  private mode: 'boot' | 'menu' | 'play' | 'pause' = 'boot'
  private sel = 0
  private game: Game | null = null
  private t = 0
  private queue = new Set<Btn>()
  private off: () => void
  onExit: () => void = () => {}

  constructor() {
    this.canvas.width = W * 2
    this.canvas.height = H * 2
    this.g = this.canvas.getContext('2d')!
    this.g.scale(2, 2)
    this.g.imageSmoothingEnabled = false
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.magFilter = NearestFilter
    this.texture.minFilter = NearestFilter
    this.texture.generateMipmaps = false
    this.off = input.onPress((b) => this.queue.add(b))
  }

  boot() {
    this.mode = 'boot'
    this.t = 0
    this.queue.clear()
    sfx.play('boot')
  }

  start(i: number) {
    this.sel = i
    this.game = GAMES[i]
    this.game.reset()
    this.mode = 'play'
    sfx.play('select')
    this.queue.clear()
  }

  update(dt: number) {
    const dtc = Math.min(dt, 1 / 20) // no tunnelling after tab switches
    this.t += dtc
    const q = this.queue
    const io: IO = { held: (b) => input.isDown(b), pressed: (b) => q.has(b) }
    const g = this.g

    switch (this.mode) {
      case 'boot':
        if (this.t > 1.4 || q.size) this.mode = 'menu'
        this.drawBoot()
        break
      case 'menu':
        if (io.pressed('up') || io.pressed('down')) sfx.play('menuMove')
        if (io.pressed('up')) this.sel = (this.sel + GAMES.length - 1) % GAMES.length
        if (io.pressed('down')) this.sel = (this.sel + 1) % GAMES.length
        if (io.pressed('a') || io.pressed('start')) this.start(this.sel)
        else if (io.pressed('power') || io.pressed('b')) this.onExit()
        this.drawMenu()
        break
      case 'play':
        if (io.pressed('power')) this.mode = 'menu'
        else if (io.pressed('start')) {
          this.mode = 'pause'
          sfx.play('pause')
        }
        else this.game!.update(dtc, io)
        this.game!.draw(g)
        break
      case 'pause':
        if (io.pressed('start') || io.pressed('a')) this.mode = 'play'
        if (io.pressed('power')) this.mode = 'menu'
        this.game!.draw(g)
        rect(g, 40, 44, W - 80, 24, C.d0)
        text(g, 'PAUSED', W / 2, 56, C.l0, 9)
        break
    }
    q.clear()
    this.texture.needsUpdate = true
  }

  private drawBoot() {
    const g = this.g
    rect(g, 0, 0, W, H, C.l0)
    const k = Math.min(1, this.t / 0.6)
    text(g, 'BMO', W / 2, 44, C.d0, 26)
    rect(g, 40, 66, 80, 6, C.l1)
    rect(g, 40, 66, 80 * k, 6, C.d0)
    text(g, 'LOADING...', W / 2, 82, C.d1, 7)
  }

  private drawMenu() {
    const g = this.g
    rect(g, 0, 0, W, H, C.l0)
    rect(g, 0, 0, W, 18, C.d0)
    text(g, 'BMO GAMES', W / 2, 10, C.l0, 9)
    GAMES.forEach((game, i) => {
      const y = 32 + i * 20
      const on = i === this.sel
      if (on) rect(g, 10, y - 8, W - 20, 16, C.d1)
      text(g, game.title, W / 2, y, on ? C.l0 : C.d0, 7)
      if (on && Math.floor(this.t * 3) % 2 === 0) text(g, '>', 16, y, C.l0, 8)
    })
    text(g, 'D-PAD: CHOOSE   RED: PLAY', W / 2, 98, C.d1, 6)
    text(g, 'BLUE: EXIT', W / 2, 106, C.d1, 6)
  }

  dispose() {
    this.off()
    this.texture.dispose()
  }
}
