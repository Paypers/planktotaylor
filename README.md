# Plank to Taylor

Hold a plank for one Taylor Swift song a day.

- **Today's song**: one random song per calendar day, the same for everyone (like Wordle). Songs are dealt from a shuffled deck, so all 243 come up before any repeat.
- **Your ladder**: the whole catalog sorted shortest to longest. Level 1 is *I Look in People's Windows* (2:11). The last level is *All Too Well (10 Minute Version)* (10:13). Climb as many levels a day as you like.
- **Streaks**: planking today's song keeps your streak. Ladder levels don't count towards it. You get a 🔥 streak, a calendar where each planked day is colored by that song's album, and your best streak, total planks and total time.
- **Music**: the song's album track (Taylor's Version where there is one) plays from YouTube on the plank screen, starting when the countdown hits zero.
- **No sign-up needed**: progress is saved in the browser. Signing in (optional) syncs it across devices.
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

Already ran `schema.sql` before? Run it again **before deploying new code**: it adds whatever columns are new (`pauses` and `xp` on planks, `prefs` and `theme` on profiles), lets a day hold more than one ladder level, tightens the rules (limits on what a player can store, photos readable only through their links), and leaves your data alone. Until it's run, settings just don't reach the account; everything else still syncs.

This adds:
- A **Sign in** button (email magic link or code, no passwords).
- Two-way sync: on sign-in, the browser's history and the account's history are merged, so nobody loses a streak by signing in late.
- **Everything tied to the account lives in the account**, so every device a player signs in on shows the same: planks, ladder, XP and rank, attempts, name and photo, and settings (music and sound, themes). Planks, attempts, the photo and name are saved the moment they happen; a setting changed on two devices keeps whichever change was made last.
- **Catching up:** phones keep a tab open for days, so whenever the site comes back into view (or back online) it syncs again, at most every 30 seconds, and picks up whatever changed on another device meanwhile.
- **One browser, one account's progress.** Signing out keeps this browser's copy. If someone else then signs in here, that copy is cleared first instead of merged, so one person's planks never land in another's account. Progress made before ever signing in still comes along.
- Signed out, nothing personal leaves the browser. The only thing sent is the +1 on today's anonymous counter.
- "**N people have planked this today**" on the daily card. Anonymous visitors count too.

Security, in short:
- Every table has row-level security: players read and write only their own rows, attempts can't be changed or removed, and the daily counter only moves up by one through `bump_daily`. The counter is open to anyone by design, so treat it as a fun number, not a tamper-proof one.
- The site ships only the publishable key. Keep the secret key out of `.env`.
- [public/_headers](public/_headers) sets security headers on Cloudflare Pages: no framing by other sites, no MIME sniffing, and no camera, microphone or location access.

## How it works

| Piece | Where |
| --- | --- |
| Song catalog, album colors, ladder order | [src/data/songs.ts](src/data/songs.ts) |
| Daily song (seeded shuffle per cycle) | [src/lib/daily.ts](src/lib/daily.ts) |
| Streak math | [src/lib/streaks.ts](src/lib/streaks.ts) |
| Recording planks, ladder, merge rules | [src/lib/progress.ts](src/lib/progress.ts) |
| Browser storage | [src/lib/store.ts](src/lib/store.ts) |
| Supabase sign-in + sync | [src/lib/account.ts](src/lib/account.ts) |
| YouTube player | [src/lib/youtube.ts](src/lib/youtube.ts), [src/components/useMusic.ts](src/components/useMusic.ts) |
| Video matching (app + sync script) | [src/lib/match.ts](src/lib/match.ts) |
| Plank timer screen | [src/components/PlankTimer.tsx](src/components/PlankTimer.tsx) |
| Settings page and its sections | [src/components/settings/](src/components/settings/) |
| Theme colors, saving and applying themes | [src/lib/palette.ts](src/lib/palette.ts), [src/lib/theme.ts](src/lib/theme.ts) |
| Page addresses (`#settings/…`, `#ranks`) | [src/lib/route.ts](src/lib/route.ts) |

Rules worth knowing:
- Days are the visitor's **local** calendar day, for the daily song and for streaks.
- A streak stays alive until the end of the day after you last planked today's song. The 🔥 in the header is grey until you've planked today's song.
- Climb as many ladder levels a day as you like (each song once a day). Only today's song keeps the streak; the calendar fills in those days and marks ladder-only days with a small ring. If today's song happens to be your ladder level, one plank counts for both.
- **XP** (signed-in players only, in [src/lib/xp.ts](src/lib/xp.ts)): a point for every second of song. No breaks: +50%. No breaks on a song over 6 minutes: double. Breaks never cost anything. XP is paid once per plank: today's song earns it every day, a ladder level the first time it's climbed. Doing either again earns nothing, except that the first go held with no breaks, after only goes with breaks, earns the no-break bonus. Signed out, the finished screen says what a plank would have earned.
- **Ranks** (in [src/lib/ranks.ts](src/lib/ranks.ts)): each is a bigger piece of writing than the last: Scribble, Couplet, Verse, Sonnet, Ballad, Chapter and Anthology, each with four divisions (IV to I), then Manuscript, Masterpiece and Magnum Opus. XP moves you through the divisions (Scribble III at 500 XP, Sonnet IV at 39,000). Each new tier also needs a ladder level: Couplet level 10, Verse 25, Sonnet 50, Ballad 100, Chapter 150, Anthology 200. Until you reach it, you stay at I and see what it takes. Manuscript needs every level climbed; Masterpiece and Magnum Opus need every level held with no breaks at least once.
- **Plaques and emblems** ([src/components/Rank.tsx](src/components/Rank.tsx), [src/components/RankEmblem.tsx](src/components/RankEmblem.tsx)): where the rank is a label (under your name, on your photo on phones, beside the XP bar) it's a plaque: the same flat plate for every rank in its tier's colour, always in the sans. Where the rank is the subject (your profile, a rank up) it's the emblem: a medallion holding that rank's piece of writing.
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

Settings has its own address (`#settings/appearance`), so Back, bookmarks and links work. On a computer the sections are listed down the left; on a phone the list comes first and each section opens on its own.

- **Adding a section** (or moving one): add an entry to `SECTIONS` in [src/components/settings/sections.ts](src/components/settings/sections.ts) with a component for its content. It gets a menu entry and its own address.
- **Themes** are saved in the browser, separate from progress, and for signed-in players in their account too, so they follow them to every device. Picking System, Light, Dark or a saved theme applies it straight away. Editing a custom theme shows each change live across the site; **Save theme** keeps it, and leaving with unsaved edits asks first. A color that gets hard to read against its background (below WCAG AA) shows a warning.
- **Colors** are CSS variables in [src/styles.css](src/styles.css). The ones a theme can change, with their labels in the editor, are listed in [src/lib/palette.ts](src/lib/palette.ts). The Light and Dark values are written in both files; a test fails if they drift apart. To make another part of the site customizable, give it its own variable in both places and add it to `COLOR_GROUPS`. Themes saved before then pick it up from Light or Dark.
- A small script in [index.html](index.html) applies the saved theme before the page first draws, so it never flashes the wrong colors. It reads the same saved format as [src/lib/theme.ts](src/lib/theme.ts).

## New releases

A new album or single goes in `ALBUMS` and `CATALOG` in [src/data/songs.ts](src/data/songs.ts) with `afterLaunch: true`. That keeps its songs out of the daily rotation and off the ladder, because adding them there would reshuffle every day's song and shift everyone's ladder level. Instead, a song premieres as the song of the day: list it in `PREMIERES` in [src/lib/daily.ts](src/lib/daily.ts). The premiere takes that one day, and the rotation picks up where it left off the next day. Nothing earlier moves.

To have it on the site the moment it's out:

1. Before release day, add the song with `?` for its length (`Patient Zero | ?`), add its premiere, and push. It stays off the site until its track is found.
2. Before the release (her new music comes out at midnight Eastern), run `npm run watch:release` and leave it running. It checks the Topic channel every 15 seconds. When the track appears, it commits the track and its exact length on top of `origin/main`, pushes, and waits for the redeploy to go live. It builds that commit without touching your working copy, so unfinished work stays local. It keeps Windows awake while it runs, but closing a laptop lid still puts it to sleep.
   - `npm run watch:release -- --try "Some Song"` is a rehearsal on a song that's already out. It finds the track and shows the commit it would push, without pushing.
   - `--dry-run` watches for the real song the same way, without pushing.
3. Visitors whose day has already started when the release lands (Europe, Asia, Australia) get the premiere when they next load the page. If they planked the usual song first, that still counts for their streak.

Fan-made. Not affiliated with Taylor Swift, her label, or YouTube.
