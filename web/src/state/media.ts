/**
 * BMO TV: one remote for two kinds of source.
 *  - YouTube (official Cartoon Network clips) in an iframe laid over BMO's screen, driven through
 *    the IFrame API postMessage protocol (no extra script download).
 *  - A user-uploaded video file played by a hidden <video>, shown on the LCD as a VideoTexture.
 */
type YTInfo = { currentTime?: number; duration?: number; volume?: number; muted?: boolean; playerState?: number }

class YouTubeRemote {
  iframe: HTMLIFrameElement | null = null
  time = 0
  duration = 0
  volume = 70
  muted = false
  state = -1 // 1 = playing, 2 = paused

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('message', this.onMessage)
  }
  attach(el: HTMLIFrameElement | null) {
    this.iframe = el
    this.state = -1
    this.time = 0
  }
  /** Ask the player to stream state updates (currentTime, volume…). */
  listen() {
    this.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  }
  cmd(func: string, args: unknown[] = []) {
    this.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }
  private onMessage = (e: MessageEvent) => {
    if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname) || typeof e.data !== 'string') return
    try {
      const d = JSON.parse(e.data) as { event: string; info: YTInfo | number }
      if (d.event === 'onStateChange' && typeof d.info === 'number') this.state = d.info
      if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && typeof d.info === 'object' && d.info) {
        const i = d.info
        if (i.currentTime !== undefined) this.time = i.currentTime
        if (i.duration) this.duration = i.duration
        if (i.volume !== undefined) this.volume = i.volume
        if (i.muted !== undefined) this.muted = i.muted
        if (i.playerState !== undefined) this.state = i.playerState
      }
    } catch {
      /* not a player message */
    }
  }
}

export const youtube = new YouTubeRemote()

let fileVideo: HTMLVideoElement | null = null
export function getFileVideo() {
  if (!fileVideo) {
    fileVideo = document.createElement('video')
    fileVideo.playsInline = true
    fileVideo.loop = true
    fileVideo.crossOrigin = 'anonymous'
    fileVideo.preload = 'auto'
  }
  return fileVideo
}

export type MediaKind = 'youtube' | 'file'

/** Remote actions; returns a short on-screen message. */
export const remote = {
  toggle(kind: MediaKind): string {
    if (kind === 'file') {
      const v = getFileVideo()
      if (v.paused) void v.play()
      else v.pause()
      return v.paused ? 'Paused' : 'Playing'
    }
    const playing = youtube.state === 1
    youtube.cmd(playing ? 'pauseVideo' : 'playVideo')
    return playing ? 'Paused' : 'Playing'
  },
  pause(kind: MediaKind) {
    if (kind === 'file') getFileVideo().pause()
    else youtube.cmd('pauseVideo')
  },
  seek(kind: MediaKind, delta: number): string {
    if (kind === 'file') {
      const v = getFileVideo()
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
    } else {
      youtube.time = Math.max(0, youtube.time + delta)
      youtube.cmd('seekTo', [youtube.time, true])
    }
    return delta > 0 ? `+${delta}s` : `${delta}s`
  },
  volume(kind: MediaKind, delta: number): string {
    if (kind === 'file') {
      const v = getFileVideo()
      v.muted = false
      v.volume = Math.max(0, Math.min(1, v.volume + delta / 100))
      return `Volume ${Math.round(v.volume * 100)}`
    }
    youtube.volume = Math.max(0, Math.min(100, youtube.volume + delta))
    youtube.cmd('unMute')
    youtube.cmd('setVolume', [youtube.volume])
    return `Volume ${youtube.volume}`
  },
  mute(kind: MediaKind): string {
    if (kind === 'file') {
      const v = getFileVideo()
      v.muted = !v.muted
      return v.muted ? 'Muted' : 'Sound on'
    }
    youtube.muted = !youtube.muted
    youtube.cmd(youtube.muted ? 'mute' : 'unMute')
    return youtube.muted ? 'Muted' : 'Sound on'
  },
}

/** Screen-space rectangle of BMO's LCD, written every frame by the 3D scene. */
export const screenOverlay = { el: null as HTMLDivElement | null }
