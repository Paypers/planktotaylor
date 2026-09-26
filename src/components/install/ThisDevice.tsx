import { accountsEnabled } from '../../lib/account'
import { promptInstall, useInstallStatus } from '../../lib/install'
import { deviceOf, installGuideFor, type Device } from '../../lib/installGuide'
import { HeldMark } from '../Icon'
import { GUIDES, GuideSteps } from './installGuides'

const THIS: Record<Device, string> = {
  iphone: 'On this iPhone',
  ipad: 'On this iPad',
  android: 'On this phone',
  computer: 'On this computer',
}

/** The steps for the device and browser this is open in, or the one-tap button where the browser has one. */
export function ThisDevice({ signedIn, onSignIn }: { signedIn: boolean; onSignIn?: () => void }) {
  const status = useInstallStatus()
  const device = deviceOf(navigator)
  const guideId = installGuideFor(navigator)
  const guide = GUIDES[guideId]
  // iPhones and iPads keep the home screen's copy apart from the browser, and apps keep their browsers apart.
  const ownCopy = device === 'iphone' || device === 'ipad' || guideId === 'in-app'

  return (
    <section className="section grid" aria-labelledby="install-here">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="install-here">{THIS[device]}</h2>
      </div>
      <div className="section-body install-here">
        {status === 'standalone' ? (
          <p className="install-done">
            <HeldMark /> You've opened it from your home screen, so you're all set.
          </p>
        ) : status === 'installed' ? (
          <p className="install-done">
            <HeldMark />{' '}
            {device === 'computer' ? "It's installed. Open it from your apps." : "It's on your home screen now. Open it from there."}
          </p>
        ) : status === 'prompt' ? (
          <>
            <p className="install-about">Your browser can add it in one {device === 'computer' ? 'click' : 'tap'}.</p>
            <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
              {device === 'computer' ? 'Install it' : 'Add to home screen'}
            </button>
          </>
        ) : (
          <>
            <h3 className="install-browser">{guide.browser}</h3>
            <GuideSteps guide={guide} />
          </>
        )}
        {ownCopy && status !== 'standalone' && (
          <OwnCopyNote inApp={guideId === 'in-app'} signedIn={signedIn} onSignIn={onSignIn} />
        )}
      </div>
    </section>
  )
}

/** Planks saved in this browser don't come along to the other copy, but an account brings everything. */
function OwnCopyNote({ inApp, signedIn, onSignIn }: { inApp: boolean; signedIn: boolean; onSignIn?: () => void }) {
  const where = inApp
    ? "Planks saved in here stay in this app's browser."
    : 'On iPhone and iPad, the home screen keeps its own copy of the site, apart from the browser.'
  // In a home screen app, the email's link would open Safari instead, so the code is the way in.
  const there = inApp ? 'in your browser' : 'on the home screen, with the code from the email'

  if (!accountsEnabled) {
    return <p className="install-copy">{where} It starts afresh there.</p>
  }
  if (signedIn) {
    return (
      <p className="install-copy">
        {where} Sign in again {there}, and everything comes with you.
      </p>
    )
  }
  return (
    <div className="install-copy">
      <p>
        {where} Sign in here first, then again {there}, and everything comes with you.
      </p>
      {onSignIn && (
        <button type="button" className="btn btn-secondary" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </div>
  )
}
