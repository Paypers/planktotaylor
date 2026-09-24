# Part 5: Daily reminders

A push notification each day with today's song and your streak. This is the site's first server-side code, and it sets up the scheduled functions that Part 6 uses too.

**Builds:** roadmap §4b · **Needs:** Part 1 (the service worker, and adding the site to the home screen: on iPhone, web push only works from the home screen, iOS 16.4 and later) · **Schema change:** yes, plus an Edge Function and a schedule

## Decided

- **Default reminder time:** 9 am local, when someone first turns reminders on. They can change it.
- **Evening nudge:** 8 pm local, on days you haven't planked yet, only when your streak is 3 or more.

## Check before building

Two things could change the plan. Check them first, and stop and say so if either fails.

1. **Sharing the daily song with the function.** The message needs today's song, premieres included, and the rule is to share [daily.ts](../../src/lib/daily.ts) with the function, not copy it. The Edge Function (Deno) would import `src/lib/daily.ts`, which imports [songs.ts](../../src/data/songs.ts) (which imports the song JSON with `with { type: 'json' }`) and [dates.ts](../../src/lib/dates.ts). The streak comes from [streaks.ts](../../src/lib/streaks.ts). Check that the Supabase CLI bundles imports from outside `supabase/functions/`. If it doesn't, generate the shared module with a script rather than copying it by hand.
2. **Sending Web Push from Deno.** A push needs VAPID signing and payload encryption. Check which library works in Supabase Edge Functions (for example `npm:web-push` through Node compatibility) before building around it.

---

## Pieces

- **Keys.** A VAPID key pair (the person makes it; see below). The public key goes in `VITE_VAPID_PUBLIC_KEY` (add it to `.env.example`); the private key is a Supabase function secret. Neither goes in the repo.
- **Table `push_subscriptions`** in [schema.sql](../../supabase/schema.sql): user, endpoint (unique), `p256dh`, `auth`, reminder time, time zone (the IANA name from `Intl.DateTimeFormat().resolvedOptions().timeZone`), evening nudge on or off, created at. RLS: own rows only. Size limits like the other tables.
- **Service worker** (`public/sw.js` from Part 1): on `push`, show the notification; on `notificationclick`, focus the open tab or open `/`.
- **Settings → Reminders**, a new section in [sections.ts](../../src/components/settings/sections.ts):
  - A switch and a time, plus a second switch for the evening nudge. The default is one reminder a day: nagging makes people turn notifications off.
  - **Signed-in players only**, to start. The server can then skip anyone who has already planked, and reminders give people a reason to sign in. Signed out, the section explains that and offers Sign in.
  - On iPhone in Safari (not opened from the home screen), explain that the site has to be added to the home screen first.
  - Ask for notification permission only when the switch is turned on, from that tap. Turning it off deletes the subscription.
- **Edge Function `supabase/functions/send-reminders`:**
  - Finds subscriptions whose local reminder time falls in the current 15-minute window.
  - Skips anyone with a `daily` plank for their own local today.
  - Sends "Today's song is Style (3:51). Your 12-day streak is on the line." With no streak, just the song. The streak comes from their daily plank days through streaks.ts, freezes included, the same as the site shows.
  - Evening nudge: same checks, only with a streak of 3 or more.
  - Removes subscriptions that fail with 404 or 410.
  - Reads other players' rows with the service key the function is given, never with the site's key.
- **Schedule:** `pg_cron` runs the function every 15 minutes through `pg_net`, set up in schema.sql and safe to run again (look the job up by name first). The call carries a secret so nobody else can trigger sends; keep it in Supabase Vault, not in schema.sql.
- **Who's due now** (time zones, the 15-minute window, day boundaries, the evening rules) goes in a pure function with vitest tests. Include a time zone where the local date differs from UTC, and a reminder time right on a window's edge.
- Help page: a Reminders section. README: what the server stores (the push endpoint, reminder time and time zone), and the setup steps below.

---

## Done when

- [ ] The two checks above passed, or the plan was changed and written into this file.
- [ ] Tests for who's due now; `npm test` and `npm run build` pass.
- [ ] Settings → Reminders works in the browser: turning it on asks for permission and saves a subscription, turning it off removes it, signed out shows the sign-in line.
- [ ] The function runs locally (`supabase functions serve`) against a test subscription and sends a push.
- [ ] Help page and README updated, including the setup steps.
- [ ] roadmap.md: §4b removed. ✓ in the index.

## For you, after this part

- Make the VAPID keys (`npx web-push generate-vapid-keys`). Put the public one in `.env` and in the host's build settings, and the private one in Supabase as a function secret.
- In Supabase: turn on `pg_cron` and `pg_net` (Database → Extensions), run schema.sql, deploy the function (`supabase functions deploy send-reminders`), and set its secrets.
- Test on an iPhone with the site on the home screen, and on Android.
