# Part 4: Year in review

Like Spotify Wrapped: slides you tap through, each with its own share card.

**Builds:** roadmap §7 · **Needs:** Part 1 (the best streak counts freezes) and Part 3 (the lights slide) · **Schema change:** no · **Deadline:** ready by **30 November 2026**

## Decided

- **Name:** "Your Plank Year".

---

## When it's open

- **Opens 1 December and stays open until the end of January.** In December it covers the year so far; in January, the year just ended.
- The first one covers 22 September to 31 December 2026.
- It's all worked out in the browser from planks and attempts, so no server is needed and it works signed out.
- While it's open, a card on the home page opens it, and it has its own address in [route.ts](../../src/lib/route.ts) (for example `#year`).
- It's built and checked in November, so make it reachable outside those dates for testing, on `localhost` only or behind a query flag.

## The slides

Leave out any slide with nothing to show (someone with two planks doesn't need nine slides).

1. **Total time planked**, with a fun comparison: "that's the Eras Tour three times over" (the show ran about 3½ hours), or "all of Midnights, 9 times". Work out album lengths from [songs.ts](../../src/data/songs.ts) rather than typing them in. Pick a comparison that comes out as a nice number; a small total gets a small comparison ("Style, 14 times").
2. **Planks, days planked, and best streak** (with freezes, from streaks.ts).
3. **Top album:** the one you planked most, in its colors.
4. **Longest single hold:** which song, and how long.
5. **Planks held all the way through 🟩**, as a count.
6. **The one that fought back:** the song that took the most attempts before you finished it. Only show it once finished and only if it took at least 2 attempts, so it reads as a win.
7. **Ladder levels climbed** this year, and the rank you reached with its emblem ([RankEmblem.tsx](../../src/components/RankEmblem.tsx)). Signed out: levels only, since only signed-in players earn XP.
8. **Lights caught** (from Part 3).
9. **A summary card** to share.

**Don't show how many breaks someone took, anywhere.**

## How to build it

- A pure function, for example `yearInReview(completions, attempts, year)` in `src/lib/yearInReview.ts`, with tests: the date window (including a January visit), each slide's numbers, empty slides left out, and counting attempts before the first finish.
- Slides: tap the right side to go on and the left to go back, swipe, arrow keys, Escape to close, and a row of progress marks at the top. No transitions under reduced motion.
- Build on [shareCard.ts](../../src/lib/shareCard.ts), adding a 1080×1920 story size for Instagram and TikTok stories next to the current 1080-wide card. Each slide gets its card, and so does the summary. Share them the same way [ShareDialog.tsx](../../src/components/ShareDialog.tsx) does.
- The browser keeps only the last 300 attempts (`KEEP` in [attempts.ts](../../src/lib/attempts.ts#L40)); the account keeps them all. That's plenty for 2026. Leave a note in the code for later years, when signed-in players may have more.

---

## Done when

- [ ] Tests for `yearInReview`; `npm test` and `npm run build` pass.
- [ ] Tried in the browser with a made-up history: a busy player, a player with two planks, and a signed-out player.
- [ ] Share cards for each slide and the summary, at both sizes, look right in the light and dark themes.
- [ ] The home-page card only shows between 1 December and 31 January.
- [ ] Help page and README mention it.
- [ ] roadmap.md: §7 removed. ✓ in the index.

## For you, after this part

- Look at it on a phone before 30 November (with the testing flag), and share a story card to Instagram to check the size.
