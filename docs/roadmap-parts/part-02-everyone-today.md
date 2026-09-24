# Part 2: How everyone did today

After you finish today's song, show how everyone did, kept friendly.

**Builds:** roadmap §5, the stats (the Discord daily post is [Part 6](part-06-discord-daily-post.md)) · **Needs:** nothing · **Schema change:** yes

This is the first feature where people see each other's results, so the rule on breaks matters most here. **Never show** a spread of break counts, "you did better than X%", or anything that ranks people. Breaks only show up as how hard a stretch of the song is.

---

## What to show

On the daily card in [App.tsx](../../src/App.tsx#L265), where "N people have planked it today" is now, once you've done today's song:

- "412 people planked Style today" (the counter already does this).
- "Together: 26 hours of planking" (total time held).
- "148 held it all the way through 🟩": a shout-out given as a count, never a percentage, so people who took a break don't feel like the minority.
- "Toughest stretch today: around 2:40", with a faint heat strip along a bar the length of the song, in the album's color. Present it as how hard the song is, not as people failing. Show it only once at least 20 people have planked, and only if there were any breaks. The text says it; the strip is decoration (`aria-hidden`).

Before you've done today's song, the card shows just the count, as now.

## Data

In [schema.sql](../../supabase/schema.sql), safe to run again:

- `daily_counts` gains `no_break int not null default 0`, `seconds bigint not null default 0` and `break_slices int[]`: how many breaks fell in each 5% of the song (20 slots).
- A new `bump_daily(p_day date, p_seconds int, p_breaks int[])`. It adds 1 to `planks`, adds the seconds, adds 1 to `no_break` when `p_breaks` is empty, and adds 1 to the slot for each break. `p_breaks` holds slot numbers (0–19), one per break, at most 20 of them. `p_seconds` is at most 3600. Refuse anything outside those limits. Same day-range check and `security definer` as the current one ([schema.sql:127](../../supabase/schema.sql#L127)); grant execute to `anon, authenticated`.
- **Keep the old `bump_daily(p_day date)` working.** Tabs opened before the deploy still call it. Postgres lets both exist since their arguments differ, and the API picks by argument names.
- In [account.ts](../../src/lib/account.ts): `bumpDailyCount` (line 518) sends the seconds and slots, and `fetchDailyCount` (line 511) reads the new columns. A break's slot is `floor(position ÷ song length × 20)`, capped at 19. Put that and the formatting ("26 hours", "around 2:40", rounded to the nearest 10 seconds at the middle of the busiest slot) in pure functions with tests.
- It's sent from the same place and on the same rule as now ([App.tsx:117](../../src/App.tsx#L117)), signed in or not. No user id goes with it.
- **Privacy text changes.** Signed-out visitors send these too, so the README line "The only thing sent is the +1 on today's anonymous counter" must now say that how long you held and where your breaks fell go too, anonymously. Same on the help page if it says so.
- Like the counter, these are fun numbers, not tamper-proof ones.

## Watch out for

- The counts load once on page load (App.tsx:80). Reload them after your own plank is counted, so your plank shows in the totals straight away.
- An old row from before the deploy has the defaults (0 seconds, no slots). The page must cope with that without showing "Together: 0 minutes".

---

## Done when

- [ ] Tests for the slot maths and the formatting; `npm test` and `npm run build` pass.
- [ ] Checked in the browser with made-up numbers: under 20 planks (no strip), no breaks at all (no toughest stretch), a big day, and an old row with only `planks`.
- [ ] Nothing on screen gives a break count per person, a percentage or a ranking.
- [ ] README privacy line and help page updated.
- [ ] roadmap.md: §5's stats removed (leave the Discord part for Part 6). ✓ in the index.

## For you, after this part

- Run [schema.sql](../../supabase/schema.sql) in the Supabase SQL Editor **before** pushing.
- After deploying, plank today's song and check the numbers appear and add up.
