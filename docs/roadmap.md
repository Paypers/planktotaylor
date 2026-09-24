# What's next

Features we've decided on but haven't built yet, with enough detail to pick any one up and build it. Suggested order is at the bottom.

## Rules every feature follows

- **Breaks never cost anything.** Finishing the song is what counts. Holding it with no breaks earns an extra on top. No feature may make taking a break look like failing: no ranking by breaks, no "you did better than X%", no counts of what someone missed. Planks with no breaks get a shout-out, and nobody else loses anything for it. This matters most anywhere people see each other's results (today's stats, Discord, groups).
- **Extras stay small.** Anything optional, like the aurora lights, pays a few XP: about 5% of a plank at most. Never enough to change how fast someone ranks up.
- **It's on trust.** There's no cheat-proofing. The stakes stay low enough that cheating isn't worth the bother.
- **Change a rule, change the help.** Every rule change goes into [HelpPage.tsx](../src/components/HelpPage.tsx) and the README as well.
- **Schema changes** go in [schema.sql](../supabase/schema.sql), written so the script is safe to run again. The README says to run it before deploying.

---

## 1. Chimes at halfway and 30 seconds left (quick win)

The plank screen already shows "Past halfway. Breathe." and "Last 30 seconds!", but your face is to the floor, so you can't see them.

- Add two tones to [sound.ts](../src/lib/sound.ts), `halfway` and `lastThirty`. They should sound different from the countdown `tick`.
- In the plank screen's tick loop ([PlankTimer.tsx](../src/components/PlankTimer.tsx), next to the final-3-seconds beeps), play each tone once per plank, the first time it's crossed. Only when `prefs.sounds` is on.

**Size:** small.

## 2. Streak freezes

Right now a single missed day ends a streak. Freezes make it a little more forgiving without letting people coast.

**Rules** (constants, so they're easy to tune, the way [xp.ts](../src/lib/xp.ts) works):

- **3 freezes each calendar month.** They refill on the 1st, and unused ones don't carry over.
- **Used automatically.** Missing today's song on a day while a streak is alive uses one freeze, charged to the month of the missed day.
- **At most 2 missed days in a row.** A third missed day in a row ends the streak, even with freezes left. A weekend away is fine; a week off isn't.
- **Frozen days keep the streak but don't add to it.** A 10-day streak, then a frozen day, then a plank makes 11.
- Ladder-only days count as missed days, the same as now: only today's song keeps the streak.
- Freezes can't be bought with XP. Spending XP would lower someone's rank, which would be confusing.

**How to build it:**

- Freezes can be worked out entirely from the list of planked days, so there's nothing new to store or sync. Rewrite `streakInfo` and `runLengths` in [streaks.ts](../src/lib/streaks.ts) to go through the days in order, from the first plank to yesterday. Keep each month's freezes left and the count of missed days in a row. Return the current streak, best streak, frozen days, and freezes left this month.
- Today isn't missed until it's over. So the streak shows as "at risk" (grey 🔥) the same as now, and the header can add "❄️ 2 left".
- On the calendar, a frozen day shows ❄️. The morning after a freeze is used, show a quiet note: "A freeze saved your streak yesterday."
- The streak number in the share card and text includes frozen days the same way (they keep it alive, they don't add to it).
- The site launched on 2026-09-22, so working freezes into older history changes almost nothing.
- Add tests next to the current streak tests in [logic.test.ts](../src/lib/logic.test.ts): the monthly refill, the 2-in-a-row limit, a month boundary in the middle of a gap, and the best streak with freezes.

**Size:** small.

## 3. Your ghost

Every attempt already records how far it got (`reached` in [attempts.ts](../src/lib/attempts.ts), in the browser and in the account). Use that to show your own best on a song you haven't finished yet.

- On the plank screen, put a small marker on the progress bar at the furthest point from earlier attempts on this song that you ended yourself (`gave-up` or `stopped`). Skip `left` and `offline`, since those weren't your choice. Label it "Your best: 1:48".
- When you pass it, play a chime and show "Past your best!" for a moment.
- Once you've finished the song, stop showing the ghost for it.
- The daily song only comes round again after 243 days, so this mostly helps with ladder levels and retries of today's song. Beginners stuck on level 1 (2:11) get the most out of it: a failed attempt now counts as progress.
- No schema change.

**Size:** small.

## 4. Add to home screen, then daily reminders, then an app

### 4a. Installable (do first)

- Add `public/manifest.webmanifest`. It needs the name, `short_name`, `start_url: "/"`, `display: "standalone"`, theme and background colors matching the light theme, and icons at 192, 512 and a 512 maskable. Also add `apple-touch-icon` and the `apple-mobile-web-app-*` meta tags in [index.html](../index.html).
- Add a small service worker. Load the page itself fresh from the network first so new deploys show up straight away, and cache the built assets. In [_headers](../public/_headers), set `Cache-Control: no-cache` on `sw.js`.
- Add an "Add to home screen" prompt. Android/Chrome: catch `beforeinstallprompt` and show our own button. iPhone: show "Share → Add to Home Screen" steps. Show it after someone's second or third plank, not on their first visit.
- **Test on a real iPhone once installed.** YouTube playback, the tap-to-play fallback, and keeping the screen awake all need checking in home-screen mode, since older iOS versions had bugs there.

### 4b. Daily reminder

- Uses Web Push. On iPhone it only works once the site is added to the home screen (iOS 16.4 and later), which is another reason to do 4a first.
- **Settings → Reminders:** a switch and a time. Optional second switch: an evening nudge on days you haven't planked yet, only when your streak is 3 or more. Default is one reminder a day. Nagging makes people turn notifications off.
- **Start with signed-in players only.** The server can then skip anyone who has already planked today's song. Reminders also give people a reason to sign in.
- **Pieces:**
  - VAPID keys.
  - A `push_subscriptions` table: user, endpoint, keys, reminder time, time zone. RLS: own rows only.
  - A Supabase Edge Function that sends them.
  - `pg_cron` running it every 15 minutes: find subscriptions whose local reminder time is in this window, skip anyone with a `daily` plank for their local today, and send.
- **Message:** "Today's song is Style (3:51). Your 12-day streak is on the line." That needs the daily song on the server. Share the logic in [daily.ts](../src/lib/daily.ts), premieres included, with the function; don't copy it.
- Subscriptions that fail with 404/410 get removed.

### 4c. Native app (later)

- **Capacitor** wraps this same site as an iOS and Android app with real push notifications. It also makes a home-screen widget possible (today's song and your streak), which is native code. Android alone could go out sooner as a TWA through Bubblewrap.
- **Check before building:** Apple's rules on using someone else's name and work (guideline 5.2). An app with "Taylor" in the name that's built around her songs could be rejected, and Google has similar rules. Apple also rejects apps that are only a website in a wrapper (4.2), so push and widgets help there. Apple's developer account is $99 a year, Google's is $25 once.

**Size:** 4a small, 4b medium (the first server-side code), 4c large.

## 5. How everyone did today (+ Discord)

After you finish today's song, show how everyone did, kept friendly.

**What to show:**

- "412 people planked Style today" (the counter already does this).
- "Together: 26 hours of planking" (total time held).
- "148 held it all the way through 🟩": a shout-out given as a count, not a percentage, so people who took a break don't feel like the minority.
- "Toughest stretch today: around 2:40": where breaks bunched up in the song, drawn as a faint heat strip along the song's bar. Show it as how hard the song is, not as people failing. Only show it once at least 20 people have planked.

**Never show:** a spread of break counts, "you did better than X%", or anything that ranks people.

**Data:**

- Add `no_break int`, `seconds bigint` and `break_slices int[]` (breaks in each 5% of the song) to `daily_counts`.
- Add a new `bump_daily` that also takes the plank's seconds and break positions, all anonymous. Cap the values: seconds at most 3600, at most 20 break positions. Keep the old one working for tabs that are still open.
- Signed-out visitors send these too. The README's privacy line ("The only thing sent is the +1") has to change to say anonymous time and break positions go too.
- Like the counter, these are fun numbers, not tamper-proof ones.

**Discord**, three levels. It's still open which one we want:

1. **Sharing a result**: works now. The text share and the link preview card both show up fine in Discord.
2. **A daily post in a server** (recommended first). A server admin pastes a Discord webhook URL into the site. Each morning a scheduled function posts "Today's song: Style (3:51) · Plank along: link", and each night today's stats (the friendly version above). There's no bot to host. It uses the same scheduled-function setup as reminders (4b), and the sign-up form needs rate limits.
3. **A Discord Activity**: the site running inside a voice channel so a group planks to the same song together. This is the big one, and it overlaps with Friends and groups (8). YouTube playing inside Discord is a risk to check first.

**Size:** medium. Discord level 2 is medium on top of that.

## 6. Aurora lights

The bridge-challenge idea without the leg lifts, which nobody can check. Tapping the screen is something the site can actually see.

**How it plays:**

- While the song plays (not during the countdown or a break), a soft aurora drifts behind the plank screen in the song's album colors. Under reduced motion it's a still glow.
- Every so often a light appears: first after 30 seconds, then every 40–70 seconds at random. It shows up at a random spot away from the video and the buttons, glows for about 6 seconds, and plays a soft chime so you know to look.
- Tap it to catch it: "+5 ✨". A 3½-minute song has about 3; All Too Well (10 Minute Version) about 12. Maximum 12 per plank.
- **Rule on the screen and in the help:** put your phone at least an arm's length away, so catching a light means lifting an arm off the floor. People who put it right next to them get a few extra XP, which doesn't matter.
- Missing a light costs nothing and is never shown anywhere. Only lights you caught appear, for example "✨ 3" on the finished screen and share card.
- Settings → Plank: a switch for lights, on by default. With it off, no lights appear and no light XP is earned.

**XP:**

- 5 per light (`LIGHT_XP` in [xp.ts](../src/lib/xp.ts)). That's about 5% of a plank, so it stays a small extra.
- Only paid on a plank that pays XP anyway (today's song each day, a ladder level the first time) and only if it's finished. Practice goes still show lights, just for fun, so nobody can farm them.
- Signed out: the finished screen says what they would have earned, as it does now.

**Build notes:**

- Tapping a light must not pause the video or count as a break: stop the tap from reaching the video, and keep lights well away from it. Make each light at least 64px.
- Add `lights int` (0–50) to `plank_completions`.
- The current limit `xp <= 2 * seconds` refuses a no-break 6-minute-plus plank with any lights. Change it to `xp <= 2 * seconds + 5 * lights` and keep the 5 in step with `LIGHT_XP`.

**Size:** medium.

## 7. Year in review

Like Spotify Wrapped: slides you tap through, each with its own share card.

- **Opens 1 December**, open until the end of January. It works it all out in the browser from planks and attempts, so no server is needed and it works signed out. The first one covers 22 September to December 2026.
- **Slides:**
  1. Total time planked, with a fun comparison: "that's the Eras Tour three times over" (the show ran about 3½ hours), or "all of Midnights, 9 times".
  2. Planks, days planked, and best streak.
  3. Top album: the one you planked most, in its colors.
  4. Longest single hold: which song, and how long.
  5. Planks held all the way through 🟩.
  6. The one that fought back: the song that took the most attempts before you finished it. Only show it once finished, so it reads as a win.
  7. Ladder levels climbed and the rank you reached, with its emblem.
  8. Lights caught, if 6 is built.
  9. A summary card to share.
- Don't show how many breaks someone took anywhere.
- Build on [shareCard.ts](../src/lib/shareCard.ts), adding a 1080×1920 story size for Instagram and TikTok stories.
- Name is still open: "Your Year in Planks" works.

**Size:** medium. **Deadline:** ready by 30 November.

## 8. Later: Collect the eras

Achievements, done her way.

- Every song you plank (today's song or the ladder) gets stamped into its album. An album page shows every song, stamped or not, in the album's colors, like the calendar.
- Finish an album and its badge goes on your profile. A song held with no breaks could get a gold stamp.
- New albums after launch (see New releases in the README) join as their songs premiere.
- All the data is already there (`song_id` on planks, `album` on songs), so there's no schema change.

**Size:** medium.

## 9. Later: Friends and groups

The biggest gap: right now nobody on the site can see anyone else.

- Join a group from an invite link. See who's planked today's song (✓, with 🟩 for no breaks; no break counts), everyone's streaks, and a group streak that only grows on days everyone planks.
- **Main work:** every rule in the database today lets a player see only their own rows. Groups need `groups` and `group_members` tables, plus rules that let members read a limited view of each other's planks.
- The same break rule applies: nothing in a group ranks people by breaks.
- Discord level 3 (the Activity) fits in here.

**Size:** large.

## Not doing

- **A public XP leaderboard.** Everything runs on trust, so a public board would fill up with made-up numbers and turn a daily habit into a contest. Groups (9) give people someone to compete with, among friends.

---

## Suggested order

| # | Feature | Size | Notes |
| --- | --- | --- | --- |
| 1 | Halfway and 30-second chimes | Small | |
| 2 | Streak freezes | Small | Nothing new to store |
| 3 | Your ghost | Small | Nothing new to store |
| 4a | Add to home screen | Small | Test on a real iPhone |
| 5 | How everyone did today | Medium | Schema change |
| 6 | Aurora lights | Medium | Schema change |
| 7 | Year in review | Medium | Ready by 30 November |
| 4b | Daily reminders | Medium | First server-side code |
| 5 | Discord daily post | Medium | Uses the same server setup as 4b |
| 8 | Collect the eras | Medium | |
| 9 | Friends and groups | Large | |
| 4c | Native app | Large | Check the store rules first |
