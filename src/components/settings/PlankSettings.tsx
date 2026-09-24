import { setPrefs, useAppData } from '../../lib/store'
import { LIGHT_XP } from '../../lib/xp'

/** Settings → Plank: what happens on the plank screen. */
export function PlankSettings() {
  const { prefs } = useAppData()
  return (
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
  )
}
