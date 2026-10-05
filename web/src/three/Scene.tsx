import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor, useProgress } from '@react-three/drei'
import { easing } from 'maath'
import { NeutralToneMapping, PMREMGenerator, Vector3 } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { prefersReducedMotion, scrollState, useBmo } from '../state/bmoStore'
import { Bmo } from './Bmo'
import { presetFor } from './presets'

const smoothPull = (p: number) => {
  const t = Math.min(1, Math.max(0, (p - 0.55) / 0.3))
  return t * t * (3 - 2 * t)
}

function CameraRig() {
  const look = useRef(new Vector3(0, 1, 0))
  const base = useRef(new Vector3(0.5, 1.35, 6.4))
  useFrame((state, dt) => {
    const { section } = useBmo.getState()
    const p = presetFor(section, state.size.width / state.size.height, scrollState.footer > 0.01)
    const lam = prefersReducedMotion ? 0.05 : 0.55
    const pull = section === 'anatomy' ? smoothPull(scrollState.anatomy) : 0
    easing.damp3(base.current, [p.cam[0] + pull * 0.6, p.cam[1] + pull * 0.2, p.cam[2] + pull * 1.6], lam, dt)
    easing.damp3(look.current, p.look, lam, dt)
    // subtle parallax from the pointer
    state.camera.position.set(
      base.current.x + state.pointer.x * 0.08,
      base.current.y + state.pointer.y * 0.05,
      base.current.z,
    )
    state.camera.lookAt(look.current)
  })
  return null
}

/** Studio reflections from three's procedural RoomEnvironment: prefiltered once, no HDR download. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.85
    room.dispose()
    pmrem.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

function ProgressReporter() {
  const progress = useProgress((s) => s.progress)
  const setLoaded = useBmo((s) => s.setLoaded)
  useEffect(() => setLoaded(progress), [progress, setLoaded])
  return null
}

function Done() {
  const setLoaded = useBmo((s) => s.setLoaded)
  useEffect(() => setLoaded(100), [setLoaded])
  return null
}

export default function Scene() {
  const [dpr, setDpr] = useState(() => Math.min(2, window.devicePixelRatio || 1))
  return (
    <Canvas
      className="webgl"
      dpr={dpr}
      camera={{ fov: 32, near: 0.1, far: 50, position: [0.5, 1.35, 6.4] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, toneMappingExposure: 1.2 }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(Math.min(2, window.devicePixelRatio || 1))}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <AdaptiveDpr pixelated={false} />
      <ProgressReporter />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 5, 4]} intensity={1.6} color="#fff4e6" />
      <directionalLight position={[4, 2, -3]} intensity={0.8} color="#d9ecff" />
      <StudioEnvironment />
      <Suspense fallback={null}>
        <Bmo />
        <Done />
      </Suspense>
      <CameraRig />
    </Canvas>
  )
}
