import type { ReactNode } from 'react'
import type { InstallGuideId } from '../../lib/installGuide'
import { Icon, type IconName } from '../Icon'

// Every browser's steps for adding the site to the home screen, with its buttons drawn as they look.
// Browsers move their buttons now and then (Safari's Share moved in iOS 26 and again in 27): when one
// does, change its steps here, and add a guide in lib/installGuide.ts if it depends on the version.

export interface InstallGuide {
  browser: string
  /** Before the steps: why they're needed. */
  about?: ReactNode
  steps: ReactNode[]
  /** After the steps: what to do if a button isn't there. */
  hint?: ReactNode
}

/** A button to press: its icon, then its name. A button that's only an icon is named for screen readers. */
function Press({ icon, name, children }: { icon?: IconName; name?: string; children?: ReactNode }) {
  if (!children) {
    return (
      <span className="press-key">
        {icon && <Icon name={icon} size={16} />}
        <span className="sr-only">{name}</span>
      </span>
    )
  }
  return (
    <strong className="press">
      {icon && <Icon name={icon} size={16} className="inline-icon" />}
      {children}
    </strong>
  )
}

const SHARE = <Press icon="share">Share</Press>
const ADD_TO_HOME_SCREEN = <Press icon="add-square">Add to Home Screen</Press>
const VIEW_MORE = <Press icon="view-more">View More</Press>
const WEB_APP_ON = (
  <>
    Leave <Press>Open as Web App</Press> on, and tap <Press>Add</Press>.
  </>
)
const PIN_IT = <>It opens in a window of its own. Pin it to the taskbar or the Dock to keep it one click away.</>

export const GUIDES: Record<InstallGuideId, InstallGuide> = {
  'iphone-safari-27': {
    browser: 'Safari, iOS 27',
    steps: [
      <>Tap <Press icon="page-menu" name="the page menu" />, at the left of the address bar.</>,
      <>Tap {SHARE}.</>,
      <>Tap {VIEW_MORE}, then {ADD_TO_HOME_SCREEN}.</>,
      WEB_APP_ON,
    ],
    hint: <>Can't see the page menu? Press and hold the address bar, then tap {SHARE}.</>,
  },
  'iphone-safari-26': {
    browser: 'Safari, iOS 26',
    steps: [
      <>Tap <Press icon="more" name="More" />, at the right of the address bar.</>,
      <>Tap {SHARE}.</>,
      <>Tap {VIEW_MORE}, then {ADD_TO_HOME_SCREEN}.</>,
      WEB_APP_ON,
    ],
    hint: <>If {SHARE} is on the toolbar, tap it straight away.</>,
  },
  'iphone-safari': {
    browser: 'Safari, iOS 18 or earlier',
    steps: [
      <>Tap {SHARE}, in the bar at the bottom of the screen.</>,
      <>Scroll down and tap {ADD_TO_HOME_SCREEN}.</>,
      <>Tap <Press>Add</Press>.</>,
    ],
    hint: <>No bar at the bottom? Tap near the bottom of the screen and it comes back.</>,
  },
  'ipad-safari': {
    browser: 'Safari on iPad',
    steps: [
      <>Tap {SHARE}, at the top right.</>,
      <>Tap {ADD_TO_HOME_SCREEN}. If it isn't there, tap {VIEW_MORE} first.</>,
      <>Leave <Press>Open as Web App</Press> on if it's there, and tap <Press>Add</Press>.</>,
    ],
  },
  'ios-other': {
    browser: 'Chrome, Edge or Firefox on iPhone and iPad',
    steps: [
      <>Tap {SHARE}. Chrome has it in the address bar; other browsers have it in their menu.</>,
      <>Tap {ADD_TO_HOME_SCREEN}. You may need to tap {VIEW_MORE} or scroll down to find it.</>,
      <>Tap <Press>Add</Press>.</>,
    ],
    hint: <>It needs iOS 16.4 or later. On an older one, open the site in Safari.</>,
  },
  'android-chrome': {
    browser: 'Chrome',
    steps: [
      <>Tap <Press icon="more-vertical" name="More" />, at the top right.</>,
      <>
        Tap <Press>Add to home screen</Press>. Newer versions call it <Press>Install and create shortcut</Press>.
      </>,
      <>Tap <Press>Install</Press>.</>,
    ],
  },
  'android-samsung': {
    browser: 'Samsung Internet',
    steps: [
      <>Tap <Press icon="menu" name="Tools" />, at the bottom right.</>,
      <>Tap <Press>Add page to</Press>, then <Press>Home screen</Press>.</>,
      <>Tap <Press>Add</Press>.</>,
    ],
    hint: <>If there's an install icon in the address bar, tapping it does the same.</>,
  },
  'android-firefox': {
    browser: 'Firefox',
    steps: [
      <>Tap <Press icon="more-vertical" name="Menu" />, beside the address bar.</>,
      <>
        Tap <Press>Add to Home screen</Press>. In newer versions it's under <Press>More</Press>.
      </>,
      <>Tap <Press>Add</Press>.</>,
    ],
  },
  'android-other': {
    browser: 'Edge, Opera and other browsers',
    steps: [
      <>
        Open the browser's menu: <Press icon="more-vertical" name="More" />, <Press icon="more" name="More" /> or{' '}
        <Press icon="menu" name="Menu" />.
      </>,
      <>
        Tap <Press>Add to home screen</Press>, <Press>Install app</Press> or <Press>Add to phone</Press>, whichever it
        has.
      </>,
      <>Tap <Press>Install</Press> or <Press>Add</Press>.</>,
    ],
  },
  'computer-chrome': {
    browser: 'Chrome',
    steps: [
      <>Click <Press icon="install" name="Install" />, at the right of the address bar.</>,
      <>Click <Press>Install</Press>.</>,
      PIN_IT,
    ],
    hint: (
      <>
        Not there? Click <Press icon="more-vertical" name="More" />, then <Press>Cast, save, and share</Press>, then{' '}
        <Press>Install page as app</Press>.
      </>
    ),
  },
  'computer-edge': {
    browser: 'Edge',
    steps: [
      <>
        Click <Press icon="more" name="Settings and more" /> at the top right, then <Press>Apps</Press>, then{' '}
        <Press>Install this site as an app</Press>.
      </>,
      <>Click <Press>Install</Press>.</>,
      PIN_IT,
    ],
    hint: <>Edge may show an app icon at the right of the address bar: clicking it does the same.</>,
  },
  'mac-safari': {
    browser: 'Safari on a Mac',
    steps: [
      <>Click <Press>File</Press> in the menu bar, then <Press>Add to Dock</Press>.</>,
      <>Click <Press>Add</Press>. It opens from the Dock in a window of its own.</>,
    ],
    hint: <>It needs macOS Sonoma (14) or later.</>,
  },
  'computer-firefox': {
    browser: 'Firefox',
    steps: [<>Click <Press>Add tab to taskbar</Press>, at the right of the address bar.</>, PIN_IT],
    hint: <>That's on Windows only. On a Mac or Linux, open the site in Chrome, Edge or Safari instead.</>,
  },
  'computer-other': {
    browser: 'Other browsers',
    steps: [<>Look for <Press>Install</Press> in the address bar or the browser's menu.</>],
    hint: <>Not there? Open the site in Chrome or Edge, which can.</>,
  },
  'in-app': {
    browser: 'Instagram, TikTok, Discord and others',
    about: (
      <>
        These apps, and most chat apps, open links in a browser of their own, which can't add anything to the home
        screen. Open it in your phone's browser first.
      </>
    ),
    steps: [
      <>
        Tap <Press icon="more" name="More" /> or <Press icon="more-vertical" name="More" />, usually at the top right.
      </>,
      <>
        Tap <Press>Open in browser</Press>, <Press>Open in Safari</Press> or <Press>Open in Chrome</Press>, whichever it
        has.
      </>,
      <>Then follow the steps for your browser.</>,
    ],
  },
}

/** Every guide, by device, in the order the page lists them. */
export const GUIDE_GROUPS: { id: string; title: string; guides: InstallGuideId[] }[] = [
  {
    id: 'iphone',
    title: 'iPhone and iPad',
    guides: ['iphone-safari-27', 'iphone-safari-26', 'iphone-safari', 'ipad-safari', 'ios-other'],
  },
  { id: 'android', title: 'Android', guides: ['android-chrome', 'android-samsung', 'android-firefox', 'android-other'] },
  {
    id: 'computer',
    title: 'On a computer',
    guides: ['computer-chrome', 'computer-edge', 'mac-safari', 'computer-firefox', 'computer-other'],
  },
  { id: 'in-app', title: 'Opened inside an app', guides: ['in-app'] },
]

/** One guide: why, if it needs saying, the numbered steps, and what to do if a button isn't there. */
export function GuideSteps({ guide }: { guide: InstallGuide }) {
  return (
    <>
      {guide.about && <p className="install-about">{guide.about}</p>}
      <ol className="install-steps">
        {guide.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {guide.hint && <p className="install-hint">{guide.hint}</p>}
    </>
  )
}
