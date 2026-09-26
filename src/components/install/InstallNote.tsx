import type { Completion } from '../../lib/progress'
import { dismissInstall, isIos, isStandalone, promptInstall, useInstallWay } from '../../lib/install'
import { followLink, hashFor, INSTALL } from '../../lib/route'

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
        <p className="row-note">Open it in one tap, full screen, like an app. There's nothing to download.</p>
      </div>
      <div className="install-actions">
        {way === 'prompt' ? (
          <button type="button" className="btn btn-secondary" onClick={() => void promptInstall()}>
            Add to home screen
          </button>
        ) : (
          <a href={hashFor(INSTALL)} className="btn btn-secondary" onClick={(e) => followLink(e, INSTALL)}>
            Show me how
          </a>
        )}
        <button type="button" className="btn btn-link" onClick={dismissInstall}>
          Not now
        </button>
      </div>
    </aside>
  )
}

/**
 * On an iPhone or iPad, the home screen's copy starts afresh: planks saved in the browser stay there.
 * Until there's a plank here, say so, and that signing in brings them.
 */
export function BringPlanksNote({ completions, onSignIn }: { completions: Completion[]; onSignIn?: () => void }) {
  if (!onSignIn || completions.length > 0 || !isStandalone() || !isIos()) return null

  return (
    <aside className="install-row" aria-labelledby="bring-heading">
      <div className="install-text">
        <h3 id="bring-heading" className="install-title">
          Planked in your browser before?
        </h3>
        <p className="row-note">
          The home screen keeps its own copy, so those planks aren't here yet. Sign in with the code from the email to
          bring them.
        </p>
      </div>
      <div className="install-actions">
        <button type="button" className="btn btn-secondary" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    </aside>
  )
}
