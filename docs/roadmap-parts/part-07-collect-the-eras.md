# Part 7: Collect the eras

Achievements, done her way: every song you plank is stamped into its album.

**Builds:** roadmap §8 · **Needs:** nothing · **Schema change:** yes, small (the `era` kind, decided below)

## Decided

- **A finished album's badge stays** when new songs join it. New songs join their album as they premiere, the way The Encore's four did. The album page shows them unstamped: "New: 4 songs to stamp". So the site needs to know which songs were out when the album was finished. [`RELEASES` in daily.ts](../../src/lib/daily.ts) has each release's songs and first day (it used to be a flat `PREMIERES` list; `PREMIERES` is now built from it).
- **Small badges for new-release groups** as well, like The Encore's four songs: stamp them all and you get a small badge of their own.
  - **What counts as a group:** songs released together after launch that join an album already out. In songs.ts that's an album entry with `afterLaunch` and `partOf` (The Encore is `partOf: 'showgirl'`). They show on the parent album's page under their own heading. The parent's badge is for its own songs, so it stays whatever joins it. A whole new album (`afterLaunch` with no `partOf`) gets a page and a full badge of its own.
  - **Called a charm:** a small round charm in the release's color with the site's star, on the edge of its album's badge, like a friendship-bracelet charm. A dashed outline until it's earned.
- **Stamping new releases after their premiere day:** the album page has a Start button on new-release songs. Finishing one stamps it: a new kind of record, `era`, with no XP, and it doesn't touch the streak or the ladder. The first go with no breaks makes the stamp gold. On its premiere day the song is today's song, so Start there starts today's song. This is a small schema change (the `era` kind on planks and attempts).
- **Gold badge:** an album whose songs all have gold stamps gets a gold edge on its badge (a charm gets one too, when all its songs are gold). A shout-out only.
- **Badges stay, and a release counts as a whole:** a badge (or charm, or gold edge) is earned on the first day every song that counted by then was stamped (or gold). Launch songs always count; a release's songs all count, announced ones too, from its first day or the day one of them was first stamped. So The Encore's charm needs all four songs, not just the ones out so far, and a later release never takes a badge away ("New: 4 songs to stamp").
- **The time ring** gets a fourth slice, New releases, for planks from album pages, in plum (`--chart-era`, checked colorblind-safe with the other three in both themes).

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
