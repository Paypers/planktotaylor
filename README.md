# Plank to Taylor

Hold a plank for one Taylor Swift song a day.

- **Today's song**: one random song per calendar day, the same for everyone (like Wordle). Songs are dealt from a shuffled deck, so all 243 come up before any repeat.
- **Your ladder**: the whole catalog sorted shortest to longest. Level 1 is *I Look in People's Windows* (2:11). The last level is *All Too Well (10 Minute Version)* (10:13). Climb as many levels a day as you like.
- **Streaks**: planking today's song keeps your streak. Ladder levels don't count towards it. Miss a day and a streak freeze covers it (3 a month, used automatically). You get a 🔥 streak, a calendar where each planked day is colored by that song's album, and your best streak, total planks and total time.
- **Music**: the song's album track (Taylor's Version where there is one) plays from YouTube on the plank screen, starting when the countdown hits zero.
- **Aurora lights**: while the song plays, a soft aurora in the album's colors drifts behind the timer, and every so often a light appears. Tap it to catch it, with your phone at least an arm's length away so it means lifting an arm. Each is a few XP on a plank that earns XP. Settings → Plank turns them off.
- **Your Plank Year**: from 1 December to the end of January, your year in planks as slides you tap through, like Spotify Wrapped, with a card to share for each.
- **No sign-up needed**: progress is saved in the browser. Signing in (optional) syncs it across devices.
- **On your home screen**: add it to a phone's home screen and it opens full screen, like an app. From the second plank on, the home page offers it: a button on Android (and Chrome or Edge on a computer), the Share steps on iPhone and iPad.
- **Themes**: System (follows the device), Light and Dark, plus your own. The ⚙ in the header opens Settings → Appearance, where you can make and save as many color themes as you like.

It's a static single-page app (Vite + React + TypeScript). With no configuration at all it runs fully: progress saved in the browser, and each song's album track from YouTube on the plank screen. Accounts are the one optional extra.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages). Copy `.env.example` to `.env` for local settings, and set the same `VITE_*` variables in your host's build settings.

The live site is <https://planktotaylor.pages.dev> (Cloudflare Pages, redeploys on every push to `main`). Moving to another address? Update the `og:url` and `og:image` addresses in [index.html](index.html): they make the preview card when someone pastes a shared result. The card image is [public/og.png](public/og.png).

## The YouTube player + exact song lengths

Each song plays its **album track** from YouTube: the auto-generated "Taylor Swift - Topic" upload, which is the album recording itself with the cover art on screen. It's never a music video or lyric video, since those add intros and title cards. Re-recorded albums always use *Taylor's Version*. Her debut and *reputation* were never re-recorded, so those use the original album tracks. The track ids and exact lengths live in `src/data/youtube-videos.json`, which is already filled in for all 243 songs. The exact lengths make each plank end when the song does.

To refresh it (after adding an album, say), run `npm run sync:youtube` with a YouTube Data API key in `.env` as `YOUTUBE_API_KEY`. To get one: [Google Cloud Console](https://console.cloud.google.com/) → enable **YouTube Data API v3** → Credentials → Create API key.

- It reads the Topic channel's whole upload list (about 2,150 tracks), which costs about 45 of the 10,000 free daily quota units. It only falls back to searches (100 units each) for songs it can't find there.
- A track only counts if it comes from the Topic channel, is titled as the song, is labelled *Taylor's Version* for re-recorded albums, and is within 10s of the length in [src/data/songs.ts](src/data/songs.ts). Live versions, remixes, acoustic and piano versions never match.
- If it finds the right track but the length is off by more than 10s, it tells you. Usually that means the length in `songs.ts` is wrong.
- Every run starts by re-checking the saved tracks through YouTube's public oEmbed endpoint (free, no key). That drops any that were removed or had embedding turned off, so they get replaced. `npm run sync:youtube -- --check` only runs that check and changes nothing, which is worth doing now and then after launch.

How playback behaves:
- **The timer follows the song.** It reads the song's position from the player instead of keeping its own time. After the 3-second countdown the song starts, and the plank clock only moves while the song plays. Ads and buffering don't count.
- **Pausing either one pauses both:** the Pause button, a tap on the video, or the phone's own media controls. Every pause is recorded (where in the song, and for how long) so it can be shared. Breaks under a second are ignored.
- Some phones, iPhones especially, only let a video start from a tap on the video itself. Until the song plays, the screen waits and says "Tap ▶ on the video". A "Start without music" button runs the timer on its own instead.
- Pressing play on the video yourself works too: the plank starts with the song.
- YouTube's scrubber is hidden, so nobody can skip ahead and cut a plank short.
- The video loads on the privacy-enhanced `youtube-nocookie.com` player.
- If a track ever stops allowing embedding, the screen switches to a "Play on YouTube" link.
- **Testing locally:** open the site at `http://localhost:5173`, not `http://127.0.0.1:5173`. YouTube plays her tracks on `localhost` but blocks them on `127.0.0.1` (error 150), and then you'd only see the "Play on YouTube" link.
- **No quota involved:** the player needs no API key and has no limits. The key and its daily quota are only for `npm run sync:youtube`, which looks the tracks up once.

## Optional: accounts, sync and the global counter (Supabase)

1. Create a project at <https://supabase.com>.
2. SQL Editor → paste and run [supabase/schema.sql](supabase/schema.sql).
3. Authentication → URL Configuration: set the Site URL to your deployed URL. Add `http://localhost:5173/` to the Redirect URLs.
4. Put the project URL and the **publishable (anon)** key in `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`.
5. Recommended: Authentication → Email Templates → Magic Link: add `{{ .Token }}` to the template. People who open the email on a different device from the one they're signing in on can then type the 6-digit code.

Already ran `schema.sql` before? Run it again **before deploying new code**: it adds whatever columns are new (`pauses`, `xp` and `lights` on planks, `prefs` and `theme` on profiles, how everyone did on the daily counts), lets a day hold more than one ladder level, tightens the rules (limits on what a player can store, photos readable only through their links), and leaves your data alone. Until it's run, settings just don't reach the account; everything else still syncs.

This adds:
- A **Sign in** button (email magic link or code, no passwords).
- Two-way sync: on sign-in, the browser's history and the account's history are merged, so nobody loses a streak by signing in late.
- **Everything tied to the account lives in the account**, so every device a player signs in on shows the same: planks, ladder, XP and rank, attempts, name and photo, and settings (music and sound, custom themes). Planks, attempts, the photo and name are saved the moment they happen; a setting changed on two devices keeps whichever change was made last. The one exception is which theme shows: each device keeps its own choice (System until one's picked there), so a laptop can be dark while a phone stays light.
- **Catching up:** phones keep a tab open for days, so whenever the site comes back into view (or back online) it syncs again, at most every 30 seconds, and picks up whatever changed on another device meanwhile.
- **One browser, one account's progress.** Signing out keeps this browser's copy. If someone else then signs in here, that copy is cleared first instead of merged, so one person's planks never land in another's account. Progress made before ever signing in still comes along.
- Signed out, nothing personal leaves the browser. The only thing sent is today's anonymous count when you plank today's song: a +1, the song's length, and where in it you took breaks. Nothing that says who.
- "**N people have planked this today**" on the daily card. Anonymous visitors count too.
- **How everyone did today** ([src/lib/together.ts](src/lib/together.ts)): once you've planked today's song, the card shows how many planked it, the time held together ("Together: 26 hours of planking"), how many held it all the way through 🟩, and, once 20 people have planked, the song's toughest stretch ("around 2:40") with a faint heat strip of where breaks bunched up. Planks with no breaks are a count, never a percentage; there are no break counts and nothing that ranks anyone. Like the counter, these are fun numbers, not tamper-proof ones.

Security, in short:
- Every table has row-level security: players read and write only their own rows, attempts can't be changed or removed, and the daily counter and its stats only move through `bump_daily`, one plank at a time, which refuses anything out of range (a song over an hour, more than 20 breaks). The counter is open to anyone by design, so treat it as a fun number, not a tamper-proof one.
- The site ships only the publishable key. Keep the secret key out of `.env`.
- [public/_headers](public/_headers) sets security headers on Cloudflare Pages: no framing by other sites, no MIME sniffing, and no camera, microphone or location access. It also has `sw.js` checked on every visit (`Cache-Control: no-cache`), so a changed service worker takes effect straight away.

## How it works

| Piece | Where |
| --- | --- |
| Song catalog, album colors, ladder order | [src/data/songs.ts](src/data/songs.ts) |
| Daily song (seeded shuffle per cycle) | [src/lib/daily.ts](src/lib/daily.ts) |
| Streak math and freezes | [src/lib/streaks.ts](src/lib/streaks.ts) |
| Recording planks, ladder, merge rules | [src/lib/progress.ts](src/lib/progress.ts) |
| Browser storage | [src/lib/store.ts](src/lib/store.ts) |
| Supabase sign-in + sync | [src/lib/account.ts](src/lib/account.ts) |
| YouTube player | [src/lib/youtube.ts](src/lib/youtube.ts), [src/components/useMusic.ts](src/components/useMusic.ts) |
| Video matching (app + sync script) | [src/lib/match.ts](src/lib/match.ts) |
| Plank timer screen | [src/components/PlankTimer.tsx](src/components/PlankTimer.tsx) |
| Aurora lights: timing and placing them | [src/lib/lights.ts](src/lib/lights.ts) |
| Settings page and its sections | [src/components/settings/](src/components/settings/) |
| Theme colors, saving and applying themes | [src/lib/palette.ts](src/lib/palette.ts), [src/lib/theme.ts](src/lib/theme.ts) |
| Page addresses (`#settings/…`, `#ranks`, `#help`, `#year`) | [src/lib/route.ts](src/lib/route.ts) |
| How everyone did today | [src/lib/together.ts](src/lib/together.ts), [src/components/Together.tsx](src/components/Together.tsx) |
| Your Plank Year: the numbers, the slides, the cards | [src/lib/yearInReview.ts](src/lib/yearInReview.ts), [src/components/YearReview.tsx](src/components/YearReview.tsx), [src/lib/yearCard.ts](src/lib/yearCard.ts) |
| Home screen: app manifest, icons, service worker, the install offer | [public/manifest.webmanifest](public/manifest.webmanifest), [public/sw.js](public/sw.js), [src/lib/install.ts](src/lib/install.ts) |

Rules worth knowing:
- Days are the visitor's **local** calendar day, for the daily song and for streaks.
- **The service worker** ([public/sw.js](public/sw.js), production builds only) loads the page from the network first, so a new deploy shows up on the next visit, and falls back to the last copy offline. The built files under `/assets/` have hashed names, so they come from its cache. It never touches YouTube, Supabase, fonts or anything else. Change how it caches and bump `VERSION` in it, which clears the old caches. The home-screen icons in `public/` are drawn from the favicon's star: cream fills the whole square on the maskable and Apple icons, since the phone rounds the corners itself.
- Today only counts as missed once it's over: the 🔥 in the header is grey until you've planked today's song.
- **Streak freezes** (in [src/lib/streaks.ts](src/lib/streaks.ts)): 3 each calendar month, refilled on the 1st, unused ones don't carry over. A missed day uses one automatically while a streak is alive, charged to the month of that day. They cover at most 2 missed days in a row: a third ends the streak, freezes left or not. A frozen day keeps the streak but doesn't add to it (10 days, a frozen day, then a plank makes 11). They're worked out from the planked days alone, so nothing extra is stored or synced. The calendar marks frozen days with a snowflake, the Streak section shows how many are left, and the morning after one's used it says so. Freezes can't be bought with XP.
- Climb as many ladder levels a day as you like (each song once a day). Only today's song keeps the streak; the calendar fills in those days and marks ladder-only days with a small ring. If today's song happens to be your ladder level, one plank counts for both.
- **XP** (signed-in players only, in [src/lib/xp.ts](src/lib/xp.ts)): a point for every second of song. No breaks: +50%. No breaks on a song over 6 minutes: double. Breaks never cost anything. Each aurora light caught adds 5. XP is paid once per plank: today's song earns it every day, a ladder level the first time it's climbed. Doing either again earns nothing, except that the first go held with no breaks, after only goes with breaks, earns the no-break bonus. Signed out, the finished screen says what a plank would have earned.
- **Aurora lights** ([src/lib/lights.ts](src/lib/lights.ts)): the first comes 30 seconds into the song, then one every 40 to 70 seconds, none in the last 10 seconds, at most 12 (about 3 in a 3½-minute song, 11 or 12 in the longest). Each glows for 6 seconds with a soft chime. They're timed in song time, so breaks never add any, and a break clears one that's showing. They appear 72px across, clear of the timer, the video and the buttons, and a tap on one never reaches the video. `LIGHT_XP` (5) each, only on a plank that pays XP anyway (today's song, a ladder level the first time) and only once it's finished; practice and extra goes still show them, just for fun. Missed lights are never shown anywhere. The count caught is saved on the plank's record (`lights`), beside its XP, and the database's limit on a plank's XP allows 5 a light: keep the two in step. Under reduced motion the aurora is a still glow. Settings → Plank has the switch (`prefs.lights`, on unless turned off).
- **Ranks** (in [src/lib/ranks.ts](src/lib/ranks.ts)): each is a bigger piece of writing than the last: Scribble, Couplet, Verse, Sonnet, Ballad, Chapter and Anthology, each with four divisions (IV to I), then Manuscript, Masterpiece and Magnum Opus. XP moves you through the divisions (Scribble III at 500 XP, Sonnet IV at 39,000). Each new tier also needs a ladder level: Couplet level 10, Verse 25, Sonnet 50, Ballad 100, Chapter 150, Anthology 200. Until you reach it, you stay at I and see what it takes. Manuscript needs every level climbed; Masterpiece and Magnum Opus need every level held with no breaks at least once.
- **Your Plank Year** (`#year`, [src/lib/yearInReview.ts](src/lib/yearInReview.ts)): open from 1 December to 31 January, offered on the home page once there's a plank in the year. December covers the year so far, January the year just ended; the first covers 22 September to 31 December 2026. It's worked out in the browser from planks and attempts, so it works signed out and needs no server. Slides, each left out when there's nothing to show: time planked (with a comparison: Eras Tour shows, your top album end to end, or your longest song), planks with the days and best streak (freezes included), top album (in its colors), longest single hold, planks held all the way through 🟩, the one that fought back (most goes before the first finish, shown only once finished), ladder levels climbed and the rank reached (signed in), lights caught, and a summary. It never counts breaks. A plank that counted twice (today's song and a ladder level) counts once here. Tap the right of a slide or swipe to go on, the left to go back; arrow keys and Escape work too. Each slide shares as a card, a story (1080×1920) or a post (1080×1350), drawn in [src/lib/yearCard.ts](src/lib/yearCard.ts). The browser keeps the last 300 attempts, which covers 2026 but may need the account's copy in later years. To look at it before December: it always opens on `localhost`, and on the live site with `?preview` in the address (`/?preview#year`).
- **Plaques and emblems** ([src/components/Rank.tsx](src/components/Rank.tsx), [src/components/RankEmblem.tsx](src/components/RankEmblem.tsx)): where the rank is a label (under your name, on your photo on phones, beside the XP bar) it's a plaque: the same flat plate for every rank in its tier's colour, always in the sans. Where the rank is the subject (your profile, a rank up) it's the emblem: a medallion holding that rank's piece of writing.
- **How it works** (`#help`, [src/components/HelpPage.tsx](src/components/HelpPage.tsx)) opens from the ⓘ button in the header: planking, breaks, today's song and the streak, the ladder, XP and ranks, accounts and sharing, in plain words. Change a rule and change it there too. The XP and account parts only show when accounts are on.
- **The Ranks page** (`#ranks`, [src/components/RanksPage.tsx](src/components/RanksPage.tsx)) opens from your plaque, under your name in the header, beside the XP bar in Streak, or in your profile. It shows your rank with your tier's four divisions, how XP and ranks work, every rank's emblem with the ladder level and XP it takes, and a full table of all 31 divisions. Its numbers come straight from [src/lib/ranks.ts](src/lib/ranks.ts) and [src/lib/xp.ts](src/lib/xp.ts), so retuning either updates the page.
- Finishing today's song (or ranking up) sets off a small burst of confetti, skipped when the device asks for reduced motion.
- Stopping early doesn't count, but you can retry as often as you like. Pausing is fine; the pauses just show up in what you share.
- **Sharing** opens a share box with two versions:
  - **An image card** (1080×1350, drawn on a canvas in [src/lib/shareCard.ts](src/lib/shareCard.ts)): the streak, the song, and the green and orange bar to scale with each pause labelled. Phones get Share image (the share sheet, with the link attached) and Copy image; computers get Copy image and Save image.
  - **Text**, like Wordle: ten 🟩 squares for the song, with a 🟧 dropped in wherever you paused, plus the times and your streak. It ends with "Plank along:" and the link, which most apps turn into a preview card.
- **Without an account**, progress is kept in the browser. When accounts are switched on, a quiet line under the streak and on the finished screen says so, with a Sign in link. Signing in brings that progress along.
- **Every attempt is on the record** ([src/lib/attempts.ts](src/lib/attempts.ts)), from the moment the plank begins: when it started, how far into the song it got, and how it ended: finished, gave up, stopped, left the page (closed, refreshed, or the phone shut it down), or connection lost. The attempt in progress is saved every 2 seconds, so even a crash leaves a record; the next visit files it as "left" where it was last saved. Losing the internet ends the attempt on the spot (the browser's offline signal, or, if the song stalls, a quick check that the site can still be reached, so an ad or a slow load doesn't count). **Plank history** in the Streak section lists them all. Signed in, attempts are saved to the account, where they can be added but never changed or removed.
- **The ladder is climbed, never skipped.** The only thing that moves it is planking your next level (or, once every level is done, starting again from level 1). Tapping a song in **The setlist** opens its details: how and when you planked it, your planks of it, and a YouTube link. For your next level there's a Start button; for a level you've climbed there's **Plank it again**, which is practice: it doesn't move the ladder, but held with no breaks it earns the level's no-break bonus if it hasn't had it.
- **The setlist marks every level** by how it went: a green tick for no breaks, an orange count of breaks (the fewest over every go), a faint dash for a level moved past without planking it. The **No breaks · With breaks · Not yet** buttons above it show their counts and filter the list, so the levels worth redoing for the no-break bonus are one tap away.

## Settings and themes

Settings has its own address (`#settings/appearance`, `#settings/plank`), so Back, bookmarks and links work. **Appearance** has the themes; **Plank** has the aurora lights switch. On a computer the sections are listed down the left; on a phone the list comes first and each section opens on its own.

- **Adding a section** (or moving one): add an entry to `SECTIONS` in [src/components/settings/sections.ts](src/components/settings/sections.ts) with a component for its content. It gets a menu entry and its own address.
- **Themes** are saved in the browser, separate from progress. Signed-in players' custom themes are kept in their account too, ready to pick on every device, but which theme shows is each device's own choice and never leaves it: System until one's picked there. Picking System, Light, Dark or a saved theme applies it straight away. Editing a custom theme shows each change live across the site; **Save theme** keeps it, and leaving with unsaved edits asks first. A color that gets hard to read against its background (below WCAG AA) shows a warning.
- **Colors** are CSS variables in [src/styles.css](src/styles.css). The ones a theme can change, with their labels in the editor, are listed in [src/lib/palette.ts](src/lib/palette.ts). The Light and Dark values are written in both files; a test fails if they drift apart. To make another part of the site customizable, give it its own variable in both places and add it to `COLOR_GROUPS`. Themes saved before then pick it up from Light or Dark.
- A small script in [index.html](index.html) applies the saved theme before the page first draws, so it never flashes the wrong colors. It reads the same saved format as [src/lib/theme.ts](src/lib/theme.ts).

## New releases

A new album or single goes in `ALBUMS` and `CATALOG` in [src/data/songs.ts](src/data/songs.ts) with `afterLaunch: true`. That keeps its songs out of the daily rotation and off the ladder, because adding them there would reshuffle every day's song and shift everyone's ladder level. Instead, a song premieres as the song of the day: list it in `PREMIERES` in [src/lib/daily.ts](src/lib/daily.ts). Several new songs play back to back with `backToBack(firstDay, [ids in track order])`, one day each. Premiere days are slotted in: the rotation picks up where it left off after them, and nothing earlier moves. A song that isn't out by its day leaves that day to a rotation song and moves nothing else.

Right now: *The Life of a Showgirl: The Encore* (Friday 25 September) premieres its four new songs back to back: Patient Zero on the 25th, Cleveland! on the 26th, Pink Clouding on the 27th and Babylon on the 28th.

To have it on the site the moment it's out:

1. Before release day, add the song with `?` for its length (`Patient Zero | ?`), add its premiere, and push. It stays off the site until its track is found.
2. Before the release (her new music comes out at midnight Eastern), run `npm run watch:release` and leave it running. It checks the Topic channel every 15 seconds. When the tracks appear, it commits them and their exact lengths (all the songs found in one check go in one commit) on top of `origin/main`, pushes, and waits for the redeploy to go live. It builds that commit without touching your working copy, so unfinished work stays local. It keeps Windows awake while it runs, but closing a laptop lid still puts it to sleep.
   - `npm run watch:release -- --try "Some Song"` is a rehearsal on a song that's already out. It finds the track and shows the commit it would push, without pushing.
   - `--dry-run` watches for the real song the same way, without pushing.
3. Visitors whose day has already started when the release lands (Europe, Asia, Australia) get the premiere when they next load the page. If they planked the usual song first, that still counts for their streak.

Fan-made. Not affiliated with Taylor Swift, her label, or YouTube.
