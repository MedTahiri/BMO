import { useEffect, useRef } from 'react'
import { ArrowDown, BatteryFull, Hand } from 'lucide-react'
import { ANATOMY, FACE, FACTS, HERO, MEET, MOVES, POWER } from '../content/bmo'
import { ArcadeCard, TvCard, useScreenControls } from './Screens'
import { EXPRESSIONS, prefersReducedMotion, scrollState, SECTIONS, useBmo, type Section } from '../state/bmoStore'

/** Keeps the store in sync with the section crossing the middle of the viewport. */
function useSectionTracking() {
  const setSection = useBmo((s) => s.setSection)
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setSection(e.target.getAttribute('data-section') as Section)
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = document.getElementById('anatomy')
        if (!el) return
        const r = el.getBoundingClientRect()
        const span = Math.max(1, r.height - window.innerHeight)
        scrollState.anatomy = Math.min(1, Math.max(0, -r.top / span))
        // footer: BMO peeks over its top edge
        const f = document.querySelector('.site-footer')
        if (f) {
          const top = f.getBoundingClientRect().top
          scrollState.footerTop = top
          scrollState.footer = Math.min(1, Math.max(0, (window.innerHeight - top) / 160))
        }
        document.documentElement.style.setProperty('--anatomy', scrollState.anatomy.toFixed(3))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [setSection])
}

/** What BMO does when a section comes into view. */
function useChoreography() {
  const section = useBmo((s) => s.section)
  useEffect(() => {
    document.documentElement.dataset.section = section
    const s = useBmo.getState()
    const auto = !prefersReducedMotion
    switch (section) {
      case 'hero':
        s.setProps({ lid_open: 0, explode: 0, back_open: 0, cartridge_insert: 0 })
        break
      case 'meet':
        if (auto) s.play('Talk')
        break
      case 'power':
        s.setProps({ back_open: 1 })
        return () => useBmo.getState().setProps({ back_open: 0 })
      case 'play':
        // cartridge goes in and BMO's screen becomes the game console
        s.setProps({ cartridge_insert: 1 })
        s.setScreenMode('game')
        return () => {
          useBmo.getState().setProps({ cartridge_insert: 0 })
          useBmo.getState().setScreenMode('face')
        }
      case 'tv':
        s.setScreenMode('video')
        return () => useBmo.getState().setScreenMode('face')
      case 'facts':
        s.play('Sit', 58)
        return () => useBmo.getState().release()
      case 'about':
        if (auto) s.play('Wave')
        break
    }
  }, [section])
}

function AnatomySteps() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = scrollState.anatomy
      ref.current?.querySelectorAll<HTMLElement>('.step').forEach((el, i) => {
        const at = ANATOMY.steps[i].at
        const next = ANATOMY.steps[i + 1]?.at ?? 2
        el.classList.toggle('on', p >= at && p < next)
      })
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div ref={ref} className="steps">
      {ANATOMY.steps.map((s) => (
        <div key={s.title} className="step">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </div>
      ))}
      <div className="progress"><span /></div>
    </div>
  )
}

export function Story() {
  useSectionTracking()
  useChoreography()
  useScreenControls()
  const play = useBmo((s) => s.play)
  const playing = useBmo((s) => s.playing)
  const setExpression = useBmo((s) => s.setExpression)
  const setProps = useBmo((s) => s.setProps)
  const back = useBmo((s) => s.target.back_open)

  return (
    <main className="story">
      <section data-section="hero" className="sec left" id="hero">
        <div className="card hero-card">
          <p className="kicker">{HERO.kicker}</p>
          <h1>{HERO.title}</h1>
          <p>{HERO.text}</p>
          <div className="row">
            <button className="btn primary" onClick={() => play('Wave')}><Hand size={20} aria-hidden /> {HERO.cta}</button>
            <a className="btn ghost" href="#meet">Scroll to explore <ArrowDown size={18} aria-hidden /></a>
          </div>
        </div>
      </section>

      <section data-section="meet" className="sec right" id="meet">
        <div className="card">
          <h2>{MEET.title}</h2>
          {MEET.paragraphs.map((p) => <p key={p.slice(0, 20)}>{p}</p>)}
          <dl className="stats">
            {MEET.stats.map((s) => (
              <div key={s.k}><dt>{s.k}</dt><dd>{s.v}</dd></div>
            ))}
          </dl>
          <p className="hint">Drag sideways on BMO to spin them.</p>
        </div>
      </section>

      <section data-section="face" className="sec left" id="face">
        <div className="card">
          <h2>{FACE.title}</h2>
          <p>{FACE.text}</p>
          <div className="chips">
            {Object.keys(EXPRESSIONS).map((e) => (
              <button key={e} className="chip" onClick={() => setExpression(e)}>{e}</button>
            ))}
          </div>
        </div>
      </section>

      <section data-section="anatomy" className="sec right tall" id="anatomy">
        <div className="sticky">
          <div className="card dark">
            <h2>{ANATOMY.title}</h2>
            <AnatomySteps />
          </div>
        </div>
      </section>

      <section data-section="power" className="sec left" id="power">
        <div className="card">
          <h2>{POWER.title}</h2>
          <p>{POWER.text}</p>
          <button className="btn primary" onClick={() => setProps({ back_open: back > 0.5 ? 0 : 1 })}>
            <BatteryFull size={20} aria-hidden /> {back > 0.5 ? 'Close the door' : 'Open the door'}
          </button>
        </div>
      </section>

      <section data-section="play" className="sec right" id="play">
        <ArcadeCard />
      </section>

      <section data-section="tv" className="sec left" id="tv">
        <TvCard />
      </section>

      <section data-section="moves" className="sec bottom" id="moves">
        <div className="card wide">
          <h2>Moves gallery</h2>
          <div className="moves">
            {MOVES.map((m) => (
              <button key={m.clip} className={`move ${playing === m.clip ? 'active' : ''}`} onClick={() => play(m.clip)}>
                <span className="icon" aria-hidden><m.icon size={22} strokeWidth={2.2} /></span>
                <strong>{m.label}</strong>
                <small>{m.text}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section data-section="facts" className="sec left" id="facts">
        <div className="card">
          <h2>{FACTS.title}</h2>
          <div className="facts">
            {FACTS.items.map((f) => (
              <article key={f.title}><h3>{f.title}</h3><p>{f.text}</p></article>
            ))}
          </div>
          <p className="credit">{FACTS.credit}</p>
        </div>
      </section>
    </main>
  )
}

export function NavDots() {
  const section = useBmo((s) => s.section)
  return (
    <nav className="dots" aria-label="Sections">
      {SECTIONS.map((s) => (
        <a key={s} href={`#${s}`} className={s === section ? 'on' : ''} aria-label={s}>
          <span>{s}</span>
        </a>
      ))}
    </nav>
  )
}
