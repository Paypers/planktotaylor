# Plank to Taylor

Hold a plank for one Taylor Swift song a day.

- **Today's song**: one random song per calendar day, the same for everyone (like Wordle). Songs are dealt from a shuffled deck, so all 243 come up before any repeat.
- **Your ladder**: the whole catalog sorted shortest to longest. Level 1 is *I Look in People's Windows* (2:11). The last level is *All Too Well (10 Minute Version)* (10:13). Climb as many levels a day as you like.
- **Streaks**: planking today's song keeps your streak. Ladder levels don't count towards it. You get a 🔥 streak, a calendar where each planked day is colored by that song's album, and your best streak, total planks and total time.
- **Music**: the song's album track (Taylor's Version where there is one) plays from YouTube on the plank screen, starting when the countdown hits zero.
- **No sign-up needed**: progress is saved in the browser. Signing in (optional) syncs it across devices.

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

Already ran `schema.sql` before? Run it again **before deploying new code**: it adds the `pauses` and `xp` columns and lets a day hold more than one ladder level, and leaves your data alone.

This adds:
- A **Sign in** button (email magic link or code, no passwords).
- Two-way sync: on sign-in, the browser's history and the account's history are merged, so nobody loses a streak by signing in late.
- "**N people have planked this today**" on the daily card. Anonymous visitors count too.

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

Rules worth knowing:
- Days are the visitor's **local** calendar day, for the daily song and for streaks.
- A streak stays alive until the end of the day after you last planked today's song. The 🔥 in the header is grey until you've planked today's song.
- Climb as many ladder levels a day as you like (each song once a day). Only today's song keeps the streak; the calendar fills in those days and marks ladder-only days with a small ring. If today's song happens to be your ladder level, one plank counts for both.
- **XP** (signed-in players only, in [src/lib/xp.ts](src/lib/xp.ts)): a point for every second of song. No breaks: +50%. No breaks on a song over 6 minutes: double. Breaks never cost anything. XP is paid once per plank: today's song earns it every day, a ladder level the first time it's climbed. Doing either again earns nothing, except that the first go held with no breaks, after only goes with breaks, earns the no-break bonus. XP adds up into ranks (rank 2 at 500 XP, rank 10 at 22,500). Signed out, the finished screen says what a plank would have earned.
- Finishing today's song (or ranking up) sets off a small burst of confetti, skipped when the device asks for reduced motion.
- Stopping early doesn't count, but you can retry as often as you like. Pausing is fine; the pauses just show up in what you share.
- **Sharing** opens a share box with two versions:
  - **An image card** (1080×1350, drawn on a canvas in [src/lib/shareCard.ts](src/lib/shareCard.ts)): the streak, the song, and the green and orange bar to scale with each pause labelled. Phones get Share image (the share sheet, with the link attached) and Copy image; computers get Copy image and Save image.
  - **Text**, like Wordle: ten 🟩 squares for the song, with a 🟧 dropped in wherever you paused, plus the times and your streak. It ends with "Plank along:" and the link, which most apps turn into a preview card.
- **Without an account**, progress is kept in the browser. When accounts are switched on, a quiet line under the streak and on the finished screen says so, with a Sign in link. Signing in brings that progress along.
- **Every attempt is on the record** ([src/lib/attempts.ts](src/lib/attempts.ts)), from the moment the plank begins: when it started, how far into the song it got, and how it ended: finished, gave up, stopped, left the page (closed, refreshed, or the phone shut it down), or connection lost. The attempt in progress is saved every 2 seconds, so even a crash leaves a record; the next visit files it as "left" where it was last saved. Losing the internet ends the attempt on the spot (the browser's offline signal, or, if the song stalls, a quick check that the site can still be reached, so an ad or a slow load doesn't count). **Plank history** in the Streak section lists them all. Signed in, attempts are saved to the account, where they can be added but never changed or removed.
- **The ladder is climbed, never skipped.** The only thing that moves it is planking your next level (or, once every level is done, starting again from level 1). Tapping a song in **The setlist** opens its details: how and when you planked it, your planks of it, and a YouTube link. For your next level there's a Start button; for a level you've climbed there's **Plank it again**, which is practice: it doesn't move the ladder, but held with no breaks it earns the level's no-break bonus if it hasn't had it.
- **The setlist marks every level** by how it went: a green tick for no breaks, an orange count of breaks (the fewest over every go), a faint dash for a level moved past without planking it. The **No breaks · With breaks · Not yet** buttons above it show their counts and filter the list, so the levels worth redoing for the no-break bonus are one tap away.

## Adding a new album

Add it to `ALBUMS` and `CATALOG` in [src/data/songs.ts](src/data/songs.ts), then run `npm run sync:youtube`. A bigger catalog reshuffles the upcoming daily songs, so deploy it around midnight. Past history isn't affected, because each plank stores its own song. New songs also join the ladder at their length position, which shifts later levels.

Fan-made. Not affiliated with Taylor Swift, her label, or YouTube.
