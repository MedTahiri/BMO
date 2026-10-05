import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight, ArrowUpDown, Circle, Gamepad2, Minus, Play, Power, Triangle, Upload, Volume2, Tv,
} from 'lucide-react'
import { GAMES_INFO, PLAY, TV, TV_CHANNELS } from '../content/bmo'
import { useBmo } from '../state/bmoStore'
import { bindKeyboard, input, type Btn } from '../state/input'
import { getFileVideo, remote, screenOverlay, youtube } from '../state/media'

/** YouTube iframe that the 3D scene keeps positioned exactly over BMO's screen. */
export function VideoOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  const mode = useBmo((s) => s.screenMode)
  const channel = useBmo((s) => s.channel)
  const upload = useBmo((s) => s.upload)
  const yt = mode === 'video' && channel >= 0 ? TV_CHANNELS[channel] : null

  useEffect(() => {
    screenOverlay.el = ref.current
    return () => void (screenOverlay.el = null)
  }, [])
  useEffect(() => {
    const v = getFileVideo()
    if (upload && v.src !== upload.url) v.src = upload.url
  }, [upload])
  useEffect(() => {
    if (mode !== 'video' || channel !== -1) getFileVideo().pause()
  }, [mode, channel])

  const origin = typeof location !== 'undefined' ? encodeURIComponent(location.origin) : ''
  return (
    <div ref={ref} className="yt-overlay" style={{ display: 'none' }}>
      {yt && (
        <iframe
          key={yt.id}
          ref={(el) => youtube.attach(el)}
          onLoad={() => youtube.listen()}
          title={yt.title}
          src={`https://www.youtube-nocookie.com/embed/${yt.id}?enablejsapi=1&controls=0&rel=0&playsinline=1&iv_load_policy=3&origin=${origin}`}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      )}
    </div>
  )
}

/** BMO's buttons + keyboard as a TV remote, and the keyboard binding for both screens. */
export function useScreenControls() {
  useEffect(() => {
    const unbindKeys = bindKeyboard(() => {
      const s = useBmo.getState()
      return (s.section === 'play' || s.section === 'tv') && s.screenMode !== 'face'
    })
    const off = input.onPress((b: Btn) => {
      const s = useBmo.getState()
      if (s.screenMode !== 'video') return
      const kind = s.channel === -1 ? 'file' : 'youtube'
      if (kind === 'file' && !s.upload) return
      let msg = ''
      switch (b) {
        case 'a': msg = remote.toggle(kind); break
        case 'left': msg = remote.seek(kind, -10); break
        case 'right': msg = remote.seek(kind, 10); break
        case 'up': msg = remote.volume(kind, 10); break
        case 'down': msg = remote.volume(kind, -10); break
        case 'b': msg = remote.mute(kind); break
        case 'c':
        case 'start': {
          const list = [...TV_CHANNELS.map((_, i) => i), ...(s.upload ? [-1] : [])]
          const next = list[(list.indexOf(s.channel) + 1) % list.length]
          remote.pause(kind)
          s.setChannel(next)
          msg = next === -1 ? s.upload!.name : TV_CHANNELS[next].title
          break
        }
        case 'power':
          remote.pause(kind)
          s.setScreenMode('face')
          msg = 'TV off'
          break
      }
      if (msg) s.showOsd(msg)
    })
    return () => {
      unbindKeys()
      off()
    }
  }, [])
}

type Legend = [ReactNode, string, string][]

function Controls({ rows }: { rows: Legend }) {
  return (
    <ul className="legend">
      {rows.map(([icon, label, keys]) => (
        <li key={label}>
          <span className="key-icon" aria-hidden>{icon}</span>
          <span>{label}</span>
          <kbd>{keys}</kbd>
        </li>
      ))}
    </ul>
  )
}

const dot = (c: string) => <Circle size={14} fill={c} stroke="none" />

export function ArcadeCard() {
  const requestGame = useBmo((s) => s.requestGame)
  const mode = useBmo((s) => s.screenMode)
  const setMode = useBmo((s) => s.setScreenMode)
  return (
    <div className="card">
      <h2><Gamepad2 size={30} aria-hidden /> {PLAY.title}</h2>
      <p>{PLAY.text}</p>
      <div className="game-list">
        {GAMES_INFO.map((g, i) => (
          <button key={g.title} className="game" onClick={() => requestGame(i)}>
            <span className="icon" aria-hidden><Play size={18} /></span>
            <span><strong>{g.title}</strong><small>{g.text}</small></span>
          </button>
        ))}
      </div>
      <Controls
        rows={[
          [<ArrowLeftRight size={16} />, 'D-pad: move / choose', 'Arrows · WASD'],
          [dot('#EE3F6B'), 'Red: jump · fire · squash · start', 'Z · Space'],
          [dot('#42D45E'), 'Green: sword · fire', 'X'],
          [<Minus size={16} />, 'Dashes: pause', 'Enter'],
          [dot('#2E44B0'), 'Blue dot: back to menu / exit', 'Esc'],
        ]}
      />
      {mode === 'face' && (
        <button className="btn primary" onClick={() => setMode('game')}><Power size={18} aria-hidden /> Turn games on</button>
      )}
    </div>
  )
}

export function TvCard() {
  const channel = useBmo((s) => s.channel)
  const setChannel = useBmo((s) => s.setChannel)
  const upload = useBmo((s) => s.upload)
  const setUpload = useBmo((s) => s.setUpload)
  const mode = useBmo((s) => s.screenMode)
  const setMode = useBmo((s) => s.setScreenMode)
  const osd = useBmo((s) => s.osd)
  const [osdVisible, setOsdVisible] = useState(false)
  useEffect(() => {
    if (!osd) return
    setOsdVisible(true)
    const t = window.setTimeout(() => setOsdVisible(false), 1600)
    return () => window.clearTimeout(t)
  }, [osd])

  const pick = (c: number) => {
    setChannel(c)
    setMode('video')
  }
  return (
    <div className="card dark">
      <h2><Tv size={30} aria-hidden /> {TV.title}</h2>
      <p>{TV.text}</p>
      <div className="channels">
        {TV_CHANNELS.map((c, i) => (
          <button key={c.id} className={`chip ${channel === i && mode === 'video' ? 'on' : ''}`} onClick={() => pick(i)}>
            <Play size={14} aria-hidden /> {c.title}
          </button>
        ))}
        {upload && (
          <button className={`chip ${channel === -1 && mode === 'video' ? 'on' : ''}`} onClick={() => pick(-1)}>
            <Play size={14} aria-hidden /> {upload.name}
          </button>
        )}
      </div>
      <label className="btn ghost upload">
        <Upload size={18} aria-hidden /> Play your own video
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setUpload({ url: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, '') })
            setMode('video')
            e.target.value = ''
          }}
        />
      </label>
      <Controls
        rows={[
          [dot('#EE3F6B'), 'Red: play / pause', 'Z · Space'],
          [<ArrowLeftRight size={16} />, 'D-pad ◀ ▶: back / forward 10s', 'Arrows'],
          [<ArrowUpDown size={16} />, 'D-pad ▲ ▼: volume', 'Arrows'],
          [dot('#42D45E'), 'Green: mute', 'X'],
          [<Triangle size={14} />, 'Triangle / dashes: next channel', 'C · Enter'],
          [dot('#2E44B0'), 'Blue dot: TV off / on', 'Esc'],
        ]}
      />
      {mode === 'face' && (
        <button className="btn primary" onClick={() => setMode('video')}><Power size={18} aria-hidden /> Turn the TV on</button>
      )}
      <p className="osd" aria-live="polite" style={{ opacity: osdVisible ? 1 : 0 }}>
        <Volume2 size={16} aria-hidden /> {osd?.text}
      </p>
      <p className="hint">Clips are official Adventure Time uploads from Cartoon Network, streamed from YouTube. Your own videos stay on your device.</p>
    </div>
  )
}
