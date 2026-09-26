# Part 10: Native app

> **Not doing** (decided 26 September 2026). There won't be an app in the App Store or Google Play. The site added to the home screen is the app, and the site teaches how to add it on each phone and browser (`#install`). The research below is kept in case that changes.

This same site as an iOS and Android app, with real push notifications and a home-screen widget.

**Builds:** roadmap §4c · **Needs:** Part 1 (installable) and Part 5 (reminders) · **Size:** large, planned below as five smaller parts (10.1–10.5)

**Status:** researched and planned (September 2026). No app code yet. Feasibility is at the bottom: **about 45% for the whole thing, 75% for Android alone.**

## Decide first (no code until these are answered)

- **Store rules.** Researched below. The name is the real risk, more than the wrapper.
- **Android first?** Recommended: yes, as a Trusted Web Activity. See 10.2.
- **Developer accounts.** Apple's costs $99 a year; Google's is $25 once.
- **A Mac.** iOS apps (and the widget, which is Swift) are built in Xcode, which only runs on a Mac. Without one, a cloud Mac (a paid build service or GitHub's macOS runners) does the building, which is slower to work with. This decides whether iOS is worth starting.
- **The store name.** "Plank to Taylor" puts her first name in the app's name, and the listing is built around her songs. See below.

---

## What the research found

### The store rules

**Apple** ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)):

- **5.2.1:** "Don't use protected third-party material such as trademarks, copyrighted works … without permission, and don't include misleading, false, or copycat representations, names, or metadata." Apps "should be submitted by the person or legal entity that owns or has licensed the intellectual property." A fan app named after an artist, built around her songs, is the textbook case for a 5.2.1 rejection. A disclaimer doesn't fix it. Apple can also ask for proof of rights at any time.
- **5.2.2 / 5.2.3:** using a third-party service (YouTube) needs its terms to allow it, and "authorization must be provided upon request." The site only uses YouTube's official embedded player, which YouTube's terms allow, and nothing is downloaded. That's defensible, but expect to explain it in the review notes.
- **4.2:** "Your app should include features, content, and UI that elevate it beyond a repackaged website." A web-view app with native push, a widget and the site bundled into the app (not loaded from the web) usually passes. A web view of the live site alone usually doesn't.
- **5.1.1(v):** an app that lets people make an account must let them **delete it in the app**. The site has no "Delete my account" yet (accounts are deleted in the Supabase dashboard). This has to be built first.

**Google Play:**

- [Impersonation](https://support.google.com/googleplay/android-developer/answer/9888374?hl=en): "Apps that falsely claim to be the official app of an established entity. Titles like 'Justin Bieber Official' are not allowed without the necessary permissions." An app that clearly says it's unofficial and doesn't use her full name or photos is on firmer ground than on iOS, but not safe.
- Intellectual property: no infringing content. The site doesn't host any of her music or artwork; the album colors and names are facts.
- Minimum functionality: Google now [rejects plain web-view apps](https://blog.webvify.app/blogs/google-play-store-policy-update-2026-webview-guide/) more often. A Trusted Web Activity of a proper installable web app is a Google-supported way in, but a thin one can still be refused.
- **New personal accounts** must run a [closed test with 12 testers for 14 days](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) before the app can go public. That needs 12 real people opted in for two weeks.
- Google also asks for account deletion, in the app and on a web page, for apps with accounts.

**YouTube** ([developer policies](https://developers.google.com/youtube/terms/developer-policies)): no playing from "a background player … not displayed in the page, tab, or screen that the user is viewing", no separating the audio, and the player can't be hidden or covered. The site already keeps the video on screen during a plank. In the app, the song must stop when the app goes to the background or the screen locks, and the widget can never play music.

### The name

Recommended: keep "Plank to Taylor" on the web, and give the store listings a name without her name in it, with "Taylor Swift" only in the description as "an unofficial fan project, not affiliated with Taylor Swift, her label or YouTube" (the site's footer already says this). For example "Song Plank: a plank a day", with the icon as the plain star mark. It lowers the 5.2.1 and impersonation risk a lot, though it can't remove it: the app is still built around her catalog.

### YouTube inside an app: the big technical catch

Since late 2025 YouTube refuses to play an embed that doesn't say which site it's on (["Error 153"](https://simonwillison.net/2025/Dec/1/youtube-embed-153-error/), "embedder identity missing referrer"). A Capacitor app on iOS serves the site from `capacitor://localhost`, which sends no usable referrer, so every song [fails with Error 153](https://github.com/ionic-team/cordova-plugin-ionic-webview/issues/701). The known fix is to [host the player page on your own https site](https://dev.to/davidvesely/fixing-youtube-error-153-in-ios-capacitor-apps-a-simple-proxy-solution-607) and frame that page in the app. Here that's a small `player.html` on planktotaylor.pages.dev: the app talks to it by `postMessage` instead of talking to YouTube's player directly. [youtube.ts](../../src/lib/youtube.ts) already wraps the player, so this is a second way in behind the same functions.

A Trusted Web Activity (Android) is Chrome itself showing the real site, so YouTube, the "Tap ▶ on the video" fallback, the wake lock and web push all work exactly as they do on the site today.

### Widgets

A widget is native code on each platform: SwiftUI with WidgetKit on iOS, an App Widget on Android. The app writes today's song and the streak into storage the widget can read (an App Group on iOS), for example with the [capacitor-widget-bridge](https://github.com/kisimediade/capacitor-widget-bridge) plugin, and asks the widget to refresh. The widget can also fetch `daily.json` itself, so it shows the right song on a new day even before the app is opened. A widget isn't possible in a Trusted Web Activity without adding native code, which is what Capacitor is for.

### Push

On Android in a Trusted Web Activity, the site's own web push (Part 5) is delegated to the app and just works. On iOS, web push already works for the home-screen web app (iOS 16.4 and later), so a native app adds reliability and the widget rather than something new. Native push goes through `@capacitor/push-notifications` (APNs on iOS). The `send-reminders` function gets a second kind of subscription, an APNs device token, sent with Apple's HTTP/2 API and a signing key kept as a function secret.

---

## The plan, in parts

### 10.1 Ready for the stores (on the site, no app yet)

- **Delete my account,** in the profile: asks first, then an Edge Function deletes the player's photo from storage and then their account (every table's rows go with it through `on delete cascade`; groups hand over or go, as Part 8 does). Both stores need it.
- **A privacy page** (`#privacy`) and a support contact: both stores ask for their addresses. It says what's stored, what a group sees and what YouTube sees.
- The store name, icon, screenshots and wording, decided above.
- **Schema change:** none (the function uses the service key). **Size:** small.

### 10.2 Android, as a Trusted Web Activity

- [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) makes the Android project from the site's manifest (Part 1). Notifications on, so Part 5's reminders work.
- `public/.well-known/assetlinks.json` proves the app and the site belong together; `_headers` serves it as JSON. Without it, Chrome shows an address bar at the top.
- A signing key (kept safe: losing it means a new app), Play App Signing, then the closed test: 12 testers for 14 days.
- Check in the app: YouTube plays, "Tap ▶" works, the screen stays awake, reminders arrive, sign-in by code works.
- **Size:** small to medium, mostly waiting on the closed test.

### 10.3 iOS, with Capacitor

- Capacitor wraps the built site (`dist/`) into an iOS app. On Android it stays a Trusted Web Activity unless 10.4 needs a native widget there too.
- `player.html` on the site, and a second way in behind [youtube.ts](../../src/lib/youtube.ts), so songs play without Error 153. Check the "Tap ▶ on the video" fallback in it.
- Keep the screen awake: the Wake Lock API if the web view has it, otherwise a keep-awake plugin.
- Sign in with the code from the email (the magic link would open Safari, not the app). The code form is already there.
- Native push: register for an APNs token, save it as a second kind of reminder subscription, and teach `send-reminders` to send it. **Schema change:** yes, a column for the kind of subscription.
- The song stops when the app goes to the background.
- **Size:** large. Needs a Mac or a cloud Mac.

### 10.4 The widget

- iOS: a WidgetKit extension showing today's song, its length and your streak (lit once today's done), opening the app on a tap. Data through an App Group; the app refreshes it after every plank and at start.
- Android: the same as an App Widget, only if Android moves from a Trusted Web Activity to Capacitor. Otherwise Android keeps the site's reminders and skips the widget.
- **Size:** medium, native code on each platform.

### 10.5 Submitting

- App Store Connect: the listing, age rating, privacy answers, and review notes explaining that it's unofficial, that songs play through YouTube's own embedded player under YouTube's terms, and that nothing is downloaded. Expect at least one round of back-and-forth.
- Play: production access after the closed test.

---

## How feasible it is

| Piece | Feasible | Why |
| --- | --- | --- |
| 10.1 Ready for the stores | 95% | Plain site work. |
| 10.2 Android, as a Trusted Web Activity | 75% | Technically near certain: it's the real site in Chrome. The risk is Play refusing it as a thin web app or for the name, plus finding 12 testers for 14 days. |
| 10.3 iOS app, built | 80% | The Error 153 workaround is known and works; a Mac is the practical hurdle. |
| 10.3 iOS app, accepted by Apple | 40% | 5.2.1 (built around an artist's name and songs, without her permission) is the most likely rejection, then 4.2. A neutral store name helps; nothing removes it. |
| 10.4 The widget | 85% | Well-trodden, but native code on each platform. |
| **The whole part, on both stores** | **about 45%** | Held back by Apple's review. |

**Recommendation:** do 10.1 (worth having on the site anyway), then 10.2 (Android). Only start iOS once Android is live and there's a Mac to build on, and go in expecting that Apple may say no.

## Sources

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (4.1, 4.2, 5.1.1, 5.2)
- [Google Play: Impersonation](https://support.google.com/googleplay/android-developer/answer/9888374?hl=en), [app testing for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [web-view apps in 2026](https://blog.webvify.app/blogs/google-play-store-policy-update-2026-webview-guide/)
- [YouTube API Services developer policies](https://developers.google.com/youtube/terms/developer-policies)
- YouTube Error 153: [Simon Willison](https://simonwillison.net/2025/Dec/1/youtube-embed-153-error/), [Ionic web view issue](https://github.com/ionic-team/cordova-plugin-ionic-webview/issues/701), [the hosted-page fix for Capacitor](https://dev.to/davidvesely/fixing-youtube-error-153-in-ios-capacitor-apps-a-simple-proxy-solution-607)
- Widgets: [capacitor-widget-bridge](https://github.com/kisimediade/capacitor-widget-bridge), [Capgo WidgetKit plugin](https://capgo.app/docs/plugins/widget-kit/)
