import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { sfx } from '../audio/sfx'

export function SoundToggle() {
  const [on, setOn] = useState(sfx.enabled)
  useEffect(() => sfx.subscribe(setOn), [])
  return (
    <button
      className="sound-toggle"
      onClick={() => sfx.setEnabled(!on)}
      aria-pressed={on}
      aria-label={on ? 'Mute sound effects' : 'Turn sound effects on'}
      title={on ? 'Sound on' : 'Sound off'}
    >
      {on ? <Volume2 size={20} aria-hidden /> : <VolumeX size={20} aria-hidden />}
    </button>
  )
}
