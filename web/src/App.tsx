import { lazy, Suspense } from 'react'
import { NavDots, Story } from './sections/Story'
import { FreePlay, Loader } from './sections/FreePlay'
import { VideoOverlay } from './sections/Screens'
import { Footer } from './sections/Footer'
import { SoundToggle } from './sections/SoundToggle'

// three.js + R3F live in their own chunk so the page text paints immediately
const Scene = lazy(() => import('./three/Scene'))

export default function App() {
  return (
    <>
      <div className="stage">
        {/* the YouTube player lives *behind* the transparent canvas; BMO's LCD cuts a hole for it */}
        <VideoOverlay />
        <div className="canvas-layer">
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </div>
      </div>
      <Loader />
      <header className="brand">
        <span className="logo">BMO</span>
      </header>
      <Story />
      <Footer />
      <NavDots />
      <SoundToggle />
      <FreePlay />
    </>
  )
}
