# Part 1: Quick wins

Four small features, all in the browser: two chimes you can hear with your face to the floor, your own best shown on the progress bar, streak freezes, and adding the site to the home screen. No database changes and no server code.

**Builds:** roadmap §1, §3, §2, §4a · **Needs:** nothing · **Schema change:** no

Build them in this order, one commit each. The chimes and the ghost both go in the plank screen's tick loop and [sound.ts](../../src/lib/sound.ts), so they come back to back. The service worker comes last: it's the one piece that can do real damage if it's wrong, since a bad one keeps serving an old copy of the site.

---

## 1. Chimes at halfway and 30 seconds left

The plank screen already shows "Past halfway. Breathe." and "Last 30 seconds!" ([`coachLine`, PlankTimer.tsx:117](../../src/components/PlankTimer.tsx#L117)), but your face is to the floor, so you can't see them.

- Add `halfway` and `lastThirty` to `sounds` in [sound.ts](../../src/lib/sound.ts). They must sound clearly different from the countdown `tick` (one short 660 Hz beep) and from `finish` (a rising arpeggio). For example, a soft two-note rise for halfway and a brighter three-note figure for 30 seconds.
- Play each one once per plank, the first time it's crossed. They go in the tick loop in [PlankTimer.tsx](../../src/components/PlankTimer.tsx#L328), next to the final-3-seconds beeps. Keep a ref for each, the way `lastBeep` works, and reset them when a new plank starts.
- Only when `prefs.sounds` is on.
- They work the same on the manual clock ("Start without music"), since the loop reads `readElapsed()` either way.
- Pausing and resuming never plays a chime again.

## 2. Your ghost

Every attempt already records how far it got (`reached`, in seconds, in [attempts.ts](../../src/lib/attempts.ts), in the browser and in the account). Use that to show your own best on a song you haven't finished yet.

- Add a pure function to attempts.ts, for example `ghostFor(songId, attempts, finished)`. It returns the furthest `reached` among this song's attempts that you ended yourself (`gave-up` or `stopped`). Skip `left` and `offline`, since those weren't your choice.
- **Once you've finished the song, there's no ghost.** Count it as finished if any attempt on it is `finished` *or* there's a completion for it. Planks from before attempts were recorded have a completion but no attempt.
- Work it out when the plank starts, so the attempt in progress never counts towards it.
- On the progress bar ([PlankTimer.tsx:537](../../src/components/PlankTimer.tsx#L537)), put a small marker at that point, labelled "Your best: 1:48". Leave it out if the best is only a few seconds.
- When you pass it, play a chime and show "Past your best!" in place of the coach line for a moment. Add the chime to sound.ts as `pastBest`, sounding different from the two above, and only play it with `prefs.sounds` on.
- The daily song only comes round again after 243 days, so this mostly helps ladder levels and retries of today's song. Beginners stuck on level 1 (2:11) get the most out of it: a failed attempt now counts as progress.
- Tests in [attempts.test.ts](../../src/lib/attempts.test.ts): which outcomes count, a finished song (by attempt and by completion) gives no ghost, and other songs' attempts are ignored.

## 3. Streak freezes

Right now a single missed day ends a streak. Freezes make it a little more forgiving without letting people coast.

**Rules.** Keep the numbers as constants at the top of [streaks.ts](../../src/lib/streaks.ts), the way [xp.ts](../../src/lib/xp.ts) keeps its numbers, so they're easy to tune.

- **3 freezes each calendar month.** They refill on the 1st, and unused ones don't carry over.
- **Used automatically.** Missing today's song on a day while a streak is alive uses one freeze, charged to the month of the missed day.
- **At most 2 missed days in a row.** A third missed day in a row ends the streak, even with freezes left. A weekend away is fine; a week off isn't.
- **Frozen days keep the streak but don't add to it.** A 10-day streak, then a frozen day, then a plank makes 11.
- Ladder-only days count as missed days, the same as now: only today's song keeps the streak.
- Freezes can't be bought with XP. Spending XP would lower someone's rank, which would be confusing.

**How to build it:**

- Freezes can be worked out entirely from the list of planked days, so there's nothing new to store or sync.
- Rewrite `streakInfo` and `runLengths` in streaks.ts to go through the days in order, from the first plank to yesterday, keeping each month's freezes left and the count of missed days in a row. `StreakInfo` gains the frozen days (`frozen: Set<DayKey>`) and `freezesLeft` for this month. In `runLengths`, a run carries on across its frozen days, but frozen days don't add to its length.
- Today isn't missed until it's over, so the streak shows as "at risk" (grey 🔥) the same as now.
- Where it shows:
  - [StreakPanel.tsx](../../src/components/StreakPanel.tsx): "❄️ 2 left" by the streak while there is one.
  - The calendar: a frozen day shows ❄️.
  - The morning after a freeze is used, a quiet note: "A freeze saved your streak yesterday."
  - The share card and share text already take `streakInfo(...).current` ([App.tsx:91](../../src/App.tsx#L91) and [App.tsx:140](../../src/App.tsx#L140)), so they pick up freezes on their own. Check they still read right.
- The site launched on 2026-09-22, so working freezes into older history changes almost nothing.
- Tests go next to the current ones in [logic.test.ts](../../src/lib/logic.test.ts) (`describe('streaks')`): the monthly refill, the 2-in-a-row limit, a gap across a month boundary (each missed day charged to its own month), running out of freezes within a month, the best streak with freezes, and "at risk" after two frozen days. Some current tests assume one missed day ends a streak. Update those on purpose; don't delete them.
- Help page and README: the streak rules change.

## 4. Add to home screen

This comes first on the way to daily reminders (Part 5). It's also the app itself: there are no store apps (Part 10 was dropped).

**Manifest and icons**

- Add `public/manifest.webmanifest` with:
  - `name` "Plank to Taylor" and a `short_name` of about 12 characters at most, so it isn't cut off under the icon;
  - `start_url: "/"` and `display: "standalone"`;
  - `theme_color` and `background_color` `#f4f0e8`, the light theme;
  - icons at 192, 512 and 512 maskable.
- Make the PNGs once from [favicon.svg](../../public/favicon.svg) (the red star on cream) with a one-off `npx` tool, and commit them. Don't add a dependency. The maskable icon and the Apple icon need the cream to fill the whole square, with no rounded corners since the phone rounds them itself, and the star inside the middle 80%.
- In [index.html](../../index.html): the manifest link, `apple-touch-icon` (180×180), and the `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` and `apple-mobile-web-app-title` meta tags.

**Service worker**

- `public/sw.js`, plain JavaScript, served from the site root.
- Page loads (navigation requests): network first, so a new deploy shows up straight away. Fall back to the cached page when offline.
- The built files under `/assets/` have hashed names and never change, so cache them and serve them from the cache. Don't let every old deploy's files pile up forever; cap or trim the cache.
- Leave every other request alone. YouTube, Supabase and Google Fonts go straight to the network, and a Supabase response is never cached.
- Name the cache with a version, and delete old caches on `activate`.
- Register it from [main.tsx](../../src/main.tsx) in production builds only (`import.meta.env.PROD`), once the page has loaded.
- In [public/_headers](../../public/_headers): `Cache-Control: no-cache` on `/sw.js`.

**The prompt**

- Show it after someone's second or third plank. Never on a first visit, and never when the site is already running from the home screen (`display-mode: standalone`, or `navigator.standalone` on iPhone).
- Android/Chrome: catch `beforeinstallprompt`, hold on to it, and show our own "Add to home screen" button that calls its `prompt()`.
- iPhone/iPad: Safari has no install event, so show the steps instead: "Tap Share, then Add to Home Screen".
- Easy to dismiss, and the dismissal is remembered in the browser (wrapped in try/catch like the rest of the local storage code).
- Put it somewhere calm, like the home page after a plank. Never over the plank screen.
- Help page: a short "Add it to your home screen" section.

**Check it:** `npm run build && npm run preview`, then Chrome DevTools → Application. The manifest shows no errors, the service worker is running, and after a rebuild a normal refresh loads the new version.

---

## Done when

- [ ] Four commits, one per feature. Tests and build pass before each.
- [ ] Chimes: each plays once in a real plank. Pausing just past halfway and resuming doesn't play it again.
- [ ] Ghost: give up a ladder level at 1:00 and start it again, and the marker is at 1:00. Passing it plays the chime and shows "Past your best!". Finish the song, start it again, and there's no marker.
- [ ] Freezes: the new tests pass. The streak panel and calendar look right with a made-up history saved to local storage (a gap of one day, a gap of two, a gap of three).
- [ ] Home screen: in `npm run preview`, the manifest is valid, the service worker runs, and a new build shows after a refresh.
- [ ] Help page and README cover streak freezes and adding the site to the home screen.
- [ ] roadmap.md: §1, §2, §3 and §4a removed (4b and 4c stay), and their rows removed from its Suggested order table. ✓ in the index.

## For you, after this part

- Deploy, then on a **real iPhone**: add the site to the home screen, open it from there, and do a plank. Check that the song plays, that the "Tap ▶ on the video" fallback works, and that the screen stays awake. Older iOS versions had bugs with all three in home-screen mode. Same on Android if you can.
