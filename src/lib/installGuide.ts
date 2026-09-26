// Which steps add the site to the home screen here, worked out from how the browser describes itself.
// Browsers move their buttons (Safari's Share moved in iOS 26 and again in 27), so each guide is one
// browser at one layout, and the page opens on the one that fits.

export type Device = 'iphone' | 'ipad' | 'android' | 'computer'

export type InstallGuideId =
  | 'iphone-safari-27'
  | 'iphone-safari-26'
  | 'iphone-safari'
  | 'ipad-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'computer-chrome'
  | 'computer-edge'
  | 'mac-safari'
  | 'computer-firefox'
  | 'computer-other'
  | 'in-app'

/** What `navigator` says about the browser. */
export interface BrowserInfo {
  userAgent: string
  platform: string
  maxTouchPoints: number
}

// Apps that open links in a browser of their own, which can't add anything to the home screen.
// Android's `; wv)` is any app's built-in web view.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Line\/|GSA\/|; wv\)/

const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo/

/** iPads report themselves as Macs, but Macs have no touch screen. */
export function deviceOf({ userAgent, platform, maxTouchPoints }: BrowserInfo): Device {
  if (/iPad/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ipad'
  if (/iPhone|iPod/.test(userAgent)) return 'iphone'
  if (/Android/.test(userAgent)) return 'android'
  return 'computer'
}

export function installGuideFor(info: BrowserInfo): InstallGuideId {
  const ua = info.userAgent
  const device = deviceOf(info)
  if (device !== 'computer' && IN_APP.test(ua)) return 'in-app'

  if (device === 'iphone' || device === 'ipad') {
    if (IOS_OTHER_BROWSER.test(ua)) return 'ios-other'
    if (device === 'ipad') return 'ipad-safari'
    // Safari's version is its iOS version. The OS in the address stays at 18 from iOS 26 on.
    const version = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0)
    if (version >= 27) return 'iphone-safari-27'
    return version === 26 ? 'iphone-safari-26' : 'iphone-safari'
  }

  if (device === 'android') {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung'
    if (/Firefox\//.test(ua)) return 'android-firefox'
    if (/EdgA\/|OPR\/|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser/.test(ua)) return 'android-other'
    return /Chrome\//.test(ua) ? 'android-chrome' : 'android-other'
  }

  if (/Edg\//.test(ua)) return 'computer-edge'
  if (/Firefox\//.test(ua)) return 'computer-firefox'
  if (/OPR\/|YaBrowser/.test(ua)) return 'computer-other'
  if (/Chrome\//.test(ua)) return 'computer-chrome'
  if (/Macintosh/.test(ua) && /Version\/\d+/.test(ua) && /Safari\//.test(ua)) return 'mac-safari'
  return 'computer-other'
}
