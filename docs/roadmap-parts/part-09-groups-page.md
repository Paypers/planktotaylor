# Part 9: Groups, the group page

The page that makes groups worth joining: who's planked today, everyone's streaks, and the group's own streak.

**Builds:** roadmap §9, second half · **Needs:** [Part 8](part-08-groups-database.md) · **Schema change:** only if the board from Part 8 turns out to be missing something

Use the answers written into Part 8's "Decided" (the group streak, who counts as everyone, who can do what).

## Decided

- **Freezes work the same for both kinds** (3 a month, at most 2 missed days in a row). A private group's day counts when everyone who joined before it planked today's song; a public group's when anyone did. A day counts only once someone has planked it.
- **On the home page,** the group cards get a section of their own, "Your groups", right under Today. It shows only once the player is in a group: no nudge before that (groups are reached from the profile and the help page).
- **A just-finished plank shows straight away** on the player's own row: the board is brought up to date from the browser, since the plank may not have reached the account yet.

---

## The page

At its own address (for example `#group/<id>`):

- **Today:** who's planked today's song, with ✓, or 🟩 for no breaks. No break counts.
- **Everyone's streak,** worked out with [streaks.ts](../../src/lib/streaks.ts) from the days the board returns, so freezes work the same as on the player's own page.
- **The group streak,** by the rule decided in Part 8.
- **Order members by name or by when they joined.** Not by streak and not by who went without breaks: nothing in a group ranks people.
- **At the top:** the group's name, how many members, and an invite button. For the person who made it: rename, make a new link, remove a member.
- **On the home page:** a small card for each group the player is in, for example "5 of 8 have planked today", linking to the page.
- Refresh the board when the page comes back into view, the way account sync catches up on return.
- Signed out, an invite link says "Sign in to join this group" and shows nothing about the group itself.

## How to build it

- The group streak goes in a pure function with tests: a day someone missed, a member who joined partway through, today not over yet, and freezes if they apply.
- Help page: the group page and the group streak.

---

## Done when

- [ ] Tests for the group streak; `npm test` and `npm run build` pass.
- [ ] Tried with two or three accounts: planking updates the other's page, 🟩 shows only for no breaks, the group streak moves as decided.
- [ ] Nothing on the page ranks members or counts breaks.
- [ ] Help page and README updated.
- [ ] roadmap.md: §9 removed. ✓ in the index.
