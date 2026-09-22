import { SONGS } from '../data/songs'
import type { Prefs } from '../lib/progress'
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
        <span>Countdown and finish beeps</span>
      </label>

      <div className="dialog-section">
        <h3>How it plays</h3>
        {VIDEOS_READY ? (
          <p>
            The plank screen plays the album version of the song from YouTube (Taylor's Version where there is one) and
            starts it when the countdown hits zero. Some phones only let it start from a tap, so if it doesn't, tap ▶.
          </p>
        ) : (
          <p>The plank screen links to the song on YouTube. Start it playing, then press Start.</p>
        )}
      </div>
    </Dialog>
  )
}
