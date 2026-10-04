import { useState } from 'react'
import { SONGS } from '../data/songs'
import type { Prefs } from '../lib/progress'
import { MAX_VOLUME, sounds, unlockAudio } from '../lib/sound'
import { setPrefs } from '../lib/store'
import { Dialog } from './Dialog'

const VIDEOS_READY = SONGS.some((song) => song.youtubeId)

export function MusicDialog({ open, prefs, onClose }: { open: boolean; prefs: Prefs; onClose: () => void }) {
  return (
    <Dialog open={open} title="Music & sound" onClose={onClose}>
      <label className="switch-row">
        <input type="checkbox" checked={prefs.music} onChange={(e) => setPrefs({ music: e.target.checked })} />
        <span>Play the song while I plank</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={prefs.sounds} onChange={(e) => setPrefs({ sounds: e.target.checked })} />
        <span>Beeps and chimes: the countdown, halfway, the last 30 seconds and the finish</span>
      </label>
      <VolumeSlider volume={prefs.volume} mutedBySetting={!prefs.sounds} />

      <div className="dialog-section">
        <h3>How it plays</h3>
        {VIDEOS_READY ? (
          <p>
            The plank screen plays the album version of the song from YouTube (Taylor's Version where there is one) and
            starts it when the countdown hits zero. Some phones only let it start from a tap on the video: tap ▶ instead of
            Start, and you still get the countdown.
          </p>
        ) : (
          <p>The plank screen links to the song on YouTube. Start it playing, then press Start.</p>
        )}
      </div>
    </Dialog>
  )
}

/**
 * How loud the beeps and chimes are. Saved on letting go rather than at every step, since each save
 * goes to the account too. A beep at the new level lets you hear it.
 */
function VolumeSlider({ volume, mutedBySetting }: { volume: number; mutedBySetting: boolean }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? volume
  const save = () => {
    if (dragging === null) return
    setPrefs({ volume: dragging })
    setDragging(null)
    unlockAudio()
    sounds.tick()
  }
  return (
    <label className="volume-row">
      <span>Volume</span>
      <input
        type="range"
        min={0}
        max={MAX_VOLUME}
        step={0.05}
        value={shown}
        disabled={mutedBySetting}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={save}
        onKeyUp={save}
        onBlur={save}
      />
      <output>{Math.round(shown * 100)}%</output>
    </label>
  )
}
