import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { CLIP_NAMES, EXPRESSIONS, PROP_NAMES, PROP_SPECS, useBmo } from '../state/bmoStore'

export function FreePlay() {
  const open = useBmo((s) => s.freeplay)
  const toggle = useBmo((s) => s.toggleFreeplay)
  const target = useBmo((s) => s.target)
  const setProps = useBmo((s) => s.setProps)
  const reset = useBmo((s) => s.reset)
  const play = useBmo((s) => s.play)
  const playing = useBmo((s) => s.playing)
  const setExpression = useBmo((s) => s.setExpression)

  return (
    <>
      <button className="fab" onClick={toggle} aria-expanded={open}>
        {open ? <><X size={18} aria-hidden /> Close</> : <><SlidersHorizontal size={18} aria-hidden /> Free play</>}
      </button>
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <h2>Free play</h2>
        <h3>Animations</h3>
        <div className="chips">
          {CLIP_NAMES.map((c) => (
            <button key={c} className={`chip ${playing === c ? 'on' : ''}`} onClick={() => play(c)}>{c}</button>
          ))}
        </div>
        <h3>Expressions</h3>
        <div className="chips">
          {Object.keys(EXPRESSIONS).map((e) => (
            <button key={e} className="chip" onClick={() => setExpression(e)}>{e}</button>
          ))}
        </div>
        <h3>Controls</h3>
        <div className="sliders">
          {PROP_NAMES.map((k) => {
            const s = PROP_SPECS[k]
            return (
              <label key={k}>
                <span>{s.label}<em>{target[k].toFixed(2)}</em></span>
                <input type="range" min={s.min} max={s.max} step={0.01} value={target[k]}
                  onChange={(e) => setProps({ [k]: Number(e.target.value) })} />
              </label>
            )
          })}
        </div>
        <button className="btn ghost full" onClick={reset}><RotateCcw size={18} aria-hidden /> Reset</button>
        <p className="hint">Tip: some sections choreograph BMO. For example, the anatomy section drives the faceplate with your scroll.</p>
      </aside>
    </>
  )
}

export function Loader() {
  const loaded = useBmo((s) => s.loaded)
  const done = loaded >= 100
  return (
    <div className={`loader ${done ? 'done' : ''}`} aria-hidden={done}>
      <div className="lcd">
        <span>LOADING{'.'.repeat(1 + (Math.floor(loaded / 12) % 3))}</span>
        <div className="bar"><i style={{ width: `${Math.max(4, loaded)}%` }} /></div>
      </div>
    </div>
  )
}
