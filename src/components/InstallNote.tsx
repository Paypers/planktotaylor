import type { Completion } from '../lib/progress'
import { dismissInstall, promptInstall, useInstallWay } from '../lib/install'
import { Icon } from './Icon'

/** Planks before the site suggests the home screen: never on a first visit. */
const AFTER_PLANKS = 2

/** "Keep it on your home screen", once someone's come back for a second plank. */
export function InstallNote({ completions }: { completions: Completion[] }) {
  const way = useInstallWay()
  // A plank that counted for both today's song and a ladder level is two records but one plank.
  const planks = new Set(completions.map((c) => c.at)).size
  if (!way || planks < AFTER_PLANKS) return null

  return (
    <aside className="install-row" aria-labelledby="install-heading">
      <div className="install-text">
        <h3 id="install-heading" className="install-title">
          Keep it on your home screen
        </h3>
        {way === 'steps' ? (
          <p className="row-note">
            Tap Share <Icon name="share" size={16} className="inline-icon" />, then Add to Home Screen. It opens full
            screen, like an app.
          </p>
        ) : (
          <p className="row-note">Open it in one tap, full screen, like an app.</p>
        )}
      </div>
      <div className="install-actions">
        {way === 'prompt' && (
          <button type="button" className="btn btn-secondary" onClick={() => void promptInstall()}>
            Add to home screen
          </button>
        )}
        <button type="button" className="btn btn-link" onClick={dismissInstall}>
          {way === 'steps' ? 'Got it' : 'Not now'}
        </button>
      </div>
    </aside>
  )
}
