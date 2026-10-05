import { Briefcase, GitBranch, Globe, Mail } from 'lucide-react'
import { AUTHOR, LEGAL } from '../content/bmo'

const ICONS = { github: GitBranch, linkedin: Briefcase, website: Globe, email: Mail } as const
const LABELS = { github: 'GitHub', linkedin: 'LinkedIn', website: 'Website', email: 'Email' } as const

function AuthorLinks() {
  const links = (Object.keys(ICONS) as (keyof typeof ICONS)[]).filter((k) => AUTHOR.links[k])
  return (
    <nav className="links" aria-label="Author links">
      {links.map((k) => {
        const Icon = ICONS[k]
        const url = AUTHOR.links[k]
        const href = k === 'email' && !url.startsWith('mailto:') ? `mailto:${url}` : url
        return (
          <a key={k} className="btn ghost" href={href} target={k === 'email' ? undefined : '_blank'} rel="noreferrer">
            <Icon size={18} aria-hidden /> {LABELS[k]}
          </a>
        )
      })}
    </nav>
  )
}

export function Footer() {
  const initials = AUTHOR.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const year = new Date().getFullYear()
  return (
    <>
      {/* "Who made this": the last story section, BMO waves from the side */}
      <section data-section="about" className="sec left about" id="about">
        <div className="card author-card">
          <div className="avatar" aria-hidden>
            {AUTHOR.avatar ? <img src={AUTHOR.avatar} alt="" /> : initials}
          </div>
          <div className="who">
            <p className="kicker">Who made this</p>
            <h2>{AUTHOR.name}</h2>
            <p className="role">{AUTHOR.role}</p>
            <p>{AUTHOR.bio}</p>
            <AuthorLinks />
          </div>
        </div>
      </section>

      {/* site footer: brand · credits · copyright */}
      <footer className="site-footer">
        <div className="cols">
          <div className="col brand-col">
            <span className="logo">BMO</span>
            <p>An interactive 3D fan page about everyone's favourite living video game console.</p>
            <a href="#hero" className="top-link">Back to top ↑</a>
          </div>
          <div className="col">
            <h3>Credits</h3>
            <ul>
              {[...LEGAL.credits, ...LEGAL.soundCredits].map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div className="col">
            <h3>Copyright</h3>
            <p>{LEGAL.disclaimer}</p>
            <p>
              {LEGAL.takedown}{' '}
              {AUTHOR.links.github && <a href={AUTHOR.links.github} target="_blank" rel="noreferrer">GitHub</a>}
            </p>
          </div>
        </div>
        <div className="bottom-bar">
          <span>© {year} {AUTHOR.name}. Original fan work.</span>
          <span>Adventure Time and BMO © Cartoon Network</span>
        </div>
      </footer>
    </>
  )
}
