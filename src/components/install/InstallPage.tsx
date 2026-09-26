import { Fragment } from 'react'
import { accountsEnabled } from '../../lib/account'
import { remindersAvailable } from '../../lib/push'
import { PageTop } from '../PageTop'
import { Topic } from '../Topic'
import { GUIDE_GROUPS, GUIDES, GuideSteps } from './installGuides'
import { ThisDevice } from './ThisDevice'

/** How to add the site to the home screen, which is the app: this device first, then every other one. */
export function InstallPage({ signedIn, onSignIn }: { signedIn: boolean; onSignIn?: () => void }) {
  return (
    <div className="info-page">
      <PageTop title="Add it to your home screen" />

      <ThisDevice signedIn={signedIn} onSignIn={onSignIn} />

      <Topic id="what" title="What you get">
        <dt>The app</dt>
        <dd>
          It opens full screen from its own icon, like an app. There's no Plank to Taylor app in the App Store or Google
          Play: this is it, with nothing to download.
        </dd>
        <dt>Always new</dt>
        <dd>It's the site itself, so it's always the latest version.</dd>
        {remindersAvailable && (
          <>
            <dt>Reminders</dt>
            <dd>
              Daily reminders come to it too. On iPhone and iPad they only come to the home screen's copy, so turn them on
              in Settings → Reminders from there.
            </dd>
          </>
        )}
        <dt>Your planks</dt>
        <dd>
          On Android and computers it shares everything with the browser. On iPhone and iPad it keeps its own copy
          {accountsEnabled
            ? ': sign in there, with the code from the email, to bring your planks along.'
            : ', and starts afresh.'}
        </dd>
      </Topic>

      {GUIDE_GROUPS.map((group) => (
        <Topic key={group.id} id={group.id} title={group.title}>
          {group.guides.map((id) => (
            <Fragment key={id}>
              <dt>{GUIDES[id].browser}</dt>
              <dd>
                <GuideSteps guide={GUIDES[id]} />
              </dd>
            </Fragment>
          ))}
        </Topic>
      ))}
    </div>
  )
}
