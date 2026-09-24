# Part 7: Collect the eras

Achievements, done her way: every song you plank is stamped into its album.

**Builds:** roadmap §8 · **Needs:** nothing · **Schema change:** no

## Decided

- **A finished album's badge stays** when new songs join it. New songs join their album as they premiere, the way The Encore's four did. The album page shows them unstamped: "New: 4 songs to stamp". So the site needs to know which songs were out when the album was finished. [`PREMIERES` in daily.ts](../../src/lib/daily.ts) has the dates for new songs.
- **Small badges for new-release groups** as well, like The Encore's four songs: stamp them all and you get a small badge of their own. Settle the details with the person when this part starts: what counts as a group, what it's called, and how it looks next to the album badges.

---

## What it is

- Every song you plank (today's song or a ladder level: anything saved as a completion) gets stamped into its album. Practice and extra-credit goes aren't completions and don't stamp.
- **Album pages.** Each shows every song on the album, stamped or not, in the album's colors, like the calendar. A song you've held with no breaks at least once gets a gold stamp.
- **An index of the albums** with how far along each one is, at its own address in [route.ts](../../src/lib/route.ts) (for example `#eras` and `#eras/<album>`). Link it from the setlist and the Ranks page.
- **Finish an album** (every song on the site stamped) and its badge goes on your profile: the [Ranks page](../../src/components/RanksPage.tsx) opened from your plaque.
- Only songs on the site count. Songs marked "?" in songs.ts aren't out yet and stay off the site; use the same list the setlist uses.
- All the data is already there (`songId` on completions, `album` on songs), so there's no schema change. It's worked out in the browser and works signed out.
- Nothing about breaks beyond the gold stamp, which is a shout-out. There's no count of songs held with breaks.

## How to build it

- A pure function, for example `eraStamps(completions)` in `src/lib/eras.ts`, with tests: stamped, gold, a finished album, songs not out yet, and the rule chosen above for new songs.
- Help page: how stamps, gold stamps and badges work. README: a line in the features list.

---

## Done when

- [ ] Tests for `eraStamps`; `npm test` and `npm run build` pass.
- [ ] Tried in the browser with a made-up history, in the light, dark and custom themes: an empty album, a half-stamped one, a finished one with its badge.
- [ ] Help page and README updated.
- [ ] roadmap.md: §8 removed. ✓ in the index.
