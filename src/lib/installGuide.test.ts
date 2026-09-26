import { describe, expect, it } from 'vitest'
import { deviceOf, installGuideFor, type BrowserInfo } from './installGuide'

const phone = (userAgent: string): BrowserInfo => ({ userAgent, platform: 'iPhone', maxTouchPoints: 5 })
const android = (userAgent: string): BrowserInfo => ({ userAgent, platform: 'Linux armv81', maxTouchPoints: 5 })
const computer = (userAgent: string, platform = 'Win32'): BrowserInfo => ({ userAgent, platform, maxTouchPoints: 0 })

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko)'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'

describe('install guide', () => {
  it('picks Safari on an iPhone by its version, since Share moved in iOS 26 and again in 27', () => {
    expect(installGuideFor(phone(`${IPHONE} Version/27.0 Mobile/15E148 Safari/604.1`))).toBe('iphone-safari-27')
    expect(installGuideFor(phone(`${IPHONE} Version/26.1 Mobile/15E148 Safari/604.1`))).toBe('iphone-safari-26')
    expect(
      installGuideFor(
        phone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'),
      ),
    ).toBe('iphone-safari')
  })

  it('tells an iPad from a Mac, though both say Macintosh', () => {
    const ipad = { userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 }
    expect(deviceOf(ipad)).toBe('ipad')
    expect(installGuideFor(ipad)).toBe('ipad-safari')
    expect(deviceOf(computer(MAC_SAFARI, 'MacIntel'))).toBe('computer')
    expect(installGuideFor(computer(MAC_SAFARI, 'MacIntel'))).toBe('mac-safari')
  })

  it('gives other iPhone browsers their own steps', () => {
    expect(installGuideFor(phone(`${IPHONE} CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1`))).toBe('ios-other')
    expect(installGuideFor(phone(`${IPHONE} FxiOS/143.0 Mobile/15E148 Safari/605.1.15`))).toBe('ios-other')
    expect(installGuideFor(phone(`${IPHONE} EdgiOS/140.0.3485.94 Version/26.0 Mobile/15E148 Safari/604.1`))).toBe('ios-other')
  })

  it("spots apps' own browsers, which can't add to the home screen", () => {
    expect(installGuideFor(phone(`${IPHONE} Mobile/15E148 Instagram 400.0.0.26.83 (iPhone15,2; iOS 18_6)`))).toBe('in-app')
    expect(installGuideFor(phone(`${IPHONE} Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.40.109;FBBV/1]`))).toBe('in-app')
    expect(
      installGuideFor(
        android(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 trill_400 BytedanceWebview/d8a21c6',
        ),
      ),
    ).toBe('in-app')
  })

  it('picks the Android browser', () => {
    expect(installGuideFor(android(`${ANDROID} Chrome/140.0.0.0 Mobile Safari/537.36`))).toBe('android-chrome')
    expect(installGuideFor(android(`${ANDROID} SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36`))).toBe(
      'android-samsung',
    )
    expect(installGuideFor(android('Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0'))).toBe(
      'android-firefox',
    )
    expect(installGuideFor(android(`${ANDROID} Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0`))).toBe(
      'android-other',
    )
  })

  it('picks the computer browser', () => {
    expect(installGuideFor(computer(`${WINDOWS} Chrome/140.0.0.0 Safari/537.36`))).toBe('computer-chrome')
    expect(installGuideFor(computer(`${WINDOWS} Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0`))).toBe('computer-edge')
    expect(installGuideFor(computer('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'))).toBe(
      'computer-firefox',
    )
    expect(
      installGuideFor(
        computer('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'Linux x86_64'),
      ),
    ).toBe('computer-chrome')
    expect(installGuideFor(computer(`${WINDOWS} Chrome/140.0.0.0 Safari/537.36 OPR/122.0.0.0`))).toBe('computer-other')
  })
})
