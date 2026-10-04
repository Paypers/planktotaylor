import { setPrefs, useAppData } from '../../lib/store'
import { LIGHT_XP } from '../../lib/xp'
import { useLyricsSwitch } from '../lyrics/useLyrics'

/** Settings → Plank: what happens on the plank screen. */
export function PlankSettings() {
  const { prefs } = useAppData()
  return (
    <>
      <section className="settings-group" aria-labelledby="lights-heading">
        <h3 id="lights-heading">Aurora lights</h3>
        <p>
          While the song plays, soft light drifts behind the timer, and every so often a light appears. Tap it to catch it:
          with your phone at least an arm's length away, that means lifting an arm.
        </p>
        <label className="switch-row">
          <input type="checkbox" checked={prefs.lights} onChange={(e) => setPrefs({ lights: e.target.checked })} />
          <span>Show aurora lights</span>
        </label>
        <p className="fine">
          Each light caught is +{LIGHT_XP} XP on a plank that earns XP: today's song, or a ladder level the first time.
          Missing one costs nothing. Turned off, there are no lights and no light XP.
        </p>
      </section>
      <section className="settings-group" aria-labelledby="stretch-heading">
        <h3 id="stretch-heading">Stretching together</h3>
        <p>
          Planking together, whoever starts can choose to stretch first: a minute of gentle stretches, the same on everyone's
          screen, then the 3-2-1.
        </p>
        <label className="switch-row">
          <input type="checkbox" checked={prefs.stretch} onChange={(e) => setPrefs({ stretch: e.target.checked })} />
          <span>Stretch along with the room</span>
        </label>
        <p className="fine">Turned off, you skip the stretch and get the 3-2-1 with everyone. You can change it during a stretch too.</p>
      </section>
      <LyricsSetting on={prefs.lyrics} />
    </>
  )
}

/** Where lyrics come from is said here in full, where they're turned on. The plank screen just credits it. */
function LyricsSetting({ on }: { on: boolean }) {
  const offered = useLyricsSwitch()
  if (offered === null) return null
  return (
    <section className="settings-group" aria-labelledby="lyrics-heading">
      <h3 id="lyrics-heading">Lyrics</h3>
      {offered ? (
        <>
          <p>The words under the buttons while you plank, the line being sung lit up. Only when the song plays from the video.</p>
          <label className="switch-row">
            <input type="checkbox" checked={on} onChange={(e) => setPrefs({ lyrics: e.target.checked })} />
            <span>Show lyrics while I plank</span>
          </label>
          <p className="fine">
            Lyrics come from LRCLIB (lrclib.net), a free database that people fill in themselves. Plank to Taylor doesn't
            license or check them, so they can be wrong or out of time, and the words belong to Taylor Swift, her
            co-writers and their publishers. With lyrics on, your browser asks LRCLIB for each song you plank to, so it
            sees your IP address and the song. The lyrics aren't saved anywhere.
          </p>
        </>
      ) : (
        <p>Lyrics aren't available at the moment.</p>
      )}
    </section>
  )
}
