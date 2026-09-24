# What's next

Features we've decided on but haven't built yet, with enough detail to pick any one up and build it. Suggested order is at the bottom.

To build them, use [the roadmap in parts](roadmap-parts/README.md): the same features grouped into sessions, one part at a time.

## Rules every feature follows

- **Breaks never cost anything.** Finishing the song is what counts. Holding it with no breaks earns an extra on top. No feature may make taking a break look like failing: no ranking by breaks, no "you did better than X%", no counts of what someone missed. Planks with no breaks get a shout-out, and nobody else loses anything for it. This matters most anywhere people see each other's results (today's stats, Discord, groups).
- **Extras stay small.** Anything optional, like the aurora lights, pays a few XP: about 5% of a plank at most. Never enough to change how fast someone ranks up.
- **It's on trust.** There's no cheat-proofing. The stakes stay low enough that cheating isn't worth the bother.
- **Change a rule, change the help.** Every rule change goes into [HelpPage.tsx](../src/components/HelpPage.tsx) and the README as well.
- **Schema changes** go in [schema.sql](../supabase/schema.sql), written so the script is safe to run again. The README says to run it before deploying.

---

## 4. Daily reminders, then an app

Adding the site to the home screen (4a) is built: a manifest, icons and a service worker.

### 4b. Daily reminder

- Uses Web Push. On iPhone it only works once the site is added to the home screen (iOS 16.4 and later).
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

**Size:** 4b medium (the first server-side code), 4c large.

## 5. Discord

How everyone did today (the stats on the daily card once you've planked today's song) is built. They're what the Discord posts share.

**Discord**, three levels. Level 2 is next ([Part 6](roadmap-parts/part-06-discord-daily-post.md)); level 3 is still open:

1. **Sharing a result**: works now. The text share and the link preview card both show up fine in Discord.
2. **A daily post in a server** (recommended first). A server admin pastes a Discord webhook URL into the site. Each morning a scheduled function posts "Today's song: Style (3:51) · Plank along: link", and each night today's stats, the friendly version from the daily card. There's no bot to host. It uses the same scheduled-function setup as reminders (4b), and the sign-up form needs rate limits.
3. **A Discord Activity**: the site running inside a voice channel so a group planks to the same song together. This is the big one, and it overlaps with Friends and groups (9). YouTube playing inside Discord is a risk to check first.

**Size:** Discord level 2 is medium.

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
| 7 | Year in review | Medium | Ready by 30 November |
| 4b | Daily reminders | Medium | First server-side code |
| 5 | Discord daily post | Medium | Uses the same server setup as 4b |
| 8 | Collect the eras | Medium | |
| 9 | Friends and groups | Large | |
| 4c | Native app | Large | Check the store rules first |
