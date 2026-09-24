# Part 10: Native app

This same site as an iOS and Android app, with real push notifications and a home-screen widget.

**Builds:** roadmap §4c · **Needs:** Part 1 (installable) and Part 5 (reminders) · **Size:** large. It gets split into more parts once the questions below are answered.

## Decide first (no code until these are answered)

- **Store rules.** Apple's guideline 5.2 covers using someone else's name and work: an app with "Taylor" in the name that's built around her songs could be rejected, and Google has similar rules. Apple's guideline 4.2 rejects apps that are only a website in a wrapper, and real push and a widget help there. Read the current guidelines, then decide on a name and whether to go ahead.
- **Android first?** Android alone could go out sooner as a Trusted Web Activity through Bubblewrap. That's little more than Part 1's manifest, a signing key, and a Digital Asset Links file on the site.
- **Developer accounts.** Apple's costs $99 a year; Google's is $25 once.

---

## Once it's decided

**Decided:** not built yet. The first session researches the store rules, writes the plan into this file (split into parts like the others), and ends with a summary of how feasible it is, as a percentage. No app code. The pieces known so far:

- **Capacitor** wraps this same site as an iOS and Android app.
- **Real push** through APNs and FCM, sent by Part 5's function as a second kind of subscription.
- **A home-screen widget** (today's song and your streak). That's native code on each platform.
- **Check in the app's web view** that YouTube plays, the "Tap ▶ on the video" fallback works and the screen stays awake, like Part 1's home-screen check.
