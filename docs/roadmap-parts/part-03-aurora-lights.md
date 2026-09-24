# Part 3: Aurora lights

The bridge-challenge idea without the leg lifts, which nobody can check. Tapping the screen is something the site can actually see.

**Builds:** roadmap §6 · **Needs:** Part 1 (so the light's chime can be picked to sound different from the others) · **Schema change:** yes

---

## How it plays

- While the song plays (not during the countdown or a break), a soft aurora drifts behind the plank screen in the album's colors ([`ALBUMS` in songs.ts](../../src/data/songs.ts#L48)). Under `prefers-reduced-motion` it's a still glow. It must never make the timer hard to read, in the light and dark themes and in custom themes.
- **Lights.** The first one appears 30 seconds in, then one every 40–70 seconds at random, counted in song time so breaks never add lights. Each shows up at a random spot away from the video and the buttons, glows for about 6 seconds, and plays a soft chime (a new sound in [sound.ts](../../src/lib/sound.ts), only with `prefs.sounds`) so you know to look. A light that's showing when a break starts just goes.
- **Tap it to catch it:** "+5 ✨". A 3½-minute song has about 3 lights; All Too Well (10 Minute Version) about 12. At most 12 per plank.
- **On the plank screen and in the help:** put your phone at least an arm's length away, so catching a light means lifting an arm off the floor. People who put it right next to them get a few extra XP, which doesn't matter.
- **Missing a light costs nothing and is never shown anywhere.** Only lights you caught appear, for example "✨ 3" on the finished screen, the share card and the share text. With none caught, nothing is shown.

## The setting

- Add a **Plank** section to Settings ([sections.ts](../../src/components/settings/sections.ts)) with an "Aurora lights" switch, on by default. With it off there's no aurora, no lights, and no light XP, so the plank screen looks the way it does today. The music and sounds switches can stay where they are, in the music dialog.
- `Prefs` in [progress.ts](../../src/lib/progress.ts#L39) gains `lights: boolean`. Prefs saved before this change, in the browser or in the account, won't have it: treat a missing value as on.

## XP

- `LIGHT_XP = 5` in [xp.ts](../../src/lib/xp.ts). That's about 5% of a plank, so it stays a small extra.
- Paid only on a plank that pays XP anyway (today's song once a day, a ladder level the first time), and only if it's finished. Practice and extra-credit goes still show lights, just for fun, and pay nothing for them, so nobody can farm them.
- `plankXp` takes the number caught, and the lights get a line of their own in `XpEarned` ([PlankTimer.tsx:732](../../src/components/PlankTimer.tsx#L732)).
- Signed out: the finished screen says what they would have earned, lights included, as it does now.
- `Completion` gains `lights?: number` (left out when 0). It's saved in the browser and synced by [account.ts](../../src/lib/account.ts) like the other fields: upload, download and merge.

## Schema

In [schema.sql](../../supabase/schema.sql), safe to run again:

- `plank_completions` gains `lights int check (lights is null or lights between 0 and 50)`.
- The limit on XP ([schema.sql:155](../../supabase/schema.sql#L155)) becomes `xp <= 2 * seconds + 5 * coalesce(lights, 0)`. As it is now, it refuses a no-break 6-minute-plus plank with any lights. Keep the 5 in step with `LIGHT_XP`, with a comment in both places. Drop and re-add the constraint as `not valid`, the same way it's done now.

## Watch out for

- **Tapping a light must never pause the video or count as a break.** Stop the tap (pointer and click events) from reaching anything underneath, and keep lights well clear of the video's box. Each light is at least 64px.
- Lights never cover the Pause or Give up buttons, or the timer.
- Animate with CSS transforms and opacity, not a canvas redrawn every frame, so older phones keep up while YouTube plays.
- Lights are timed off song time from `readElapsed()`, so the manual clock ("Start without music") works too.

---

## Done when

- [ ] Tests: XP with lights, no light XP on practice or unfinished planks, the merge keeps `lights`, old prefs without `lights` count as on.
- [ ] `npm test` and `npm run build` pass.
- [ ] Tried in the browser: lights appear on time, catching one shows "+5 ✨" without pausing the song, a break clears a light, the setting turns everything off, reduced motion gives a still glow.
- [ ] "✨ 3" on the finished screen, share card and share text, and nothing when 0.
- [ ] Help page (the arm's-length rule, lights, their XP) and README updated.
- [ ] roadmap.md: §6 removed. ✓ in the index.

## For you, after this part

- Run [schema.sql](../../supabase/schema.sql) **before** pushing. Until it's run, a signed-in plank with lights may be refused by the database.
- On a real phone at arm's length: lights are easy to see and catch, and a tap never pauses the song.
