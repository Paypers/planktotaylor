# What's next

Features we've decided on but haven't built yet, with enough detail to pick any one up and build it. Suggested order is at the bottom.

To build them, use [the roadmap in parts](roadmap-parts/README.md): the same features grouped into sessions, one part at a time.

## Rules every feature follows

- **Breaks never cost anything.** Finishing the song is what counts. Holding it with no breaks earns an extra on top. No feature may make taking a break look like failing: no ranking by breaks, no "you did better than X%", no counts of what someone missed. Planks with no breaks get a shout-out, and nobody else loses anything for it. This matters most anywhere people see each other's results (today's stats, Discord, groups).
- **Extras stay small.** Anything optional, like the aurora lights, pays a few XP: about 5% of a plank at most. Never enough to change how fast someone ranks up.
- **It's on trust.** There's no cheat-proofing. The stakes stay low enough that cheating isn't worth the bother.
- **Change a rule, change the help.** Every rule change goes into [HelpPage.tsx](../src/components/HelpPage.tsx) and the README as well.
- **Schema changes** go in [schema.sql](../supabase/schema.sql), written so the script is safe to run again. The README says to run it before deploying.

---

## 5. Discord Activity

Sharing a result (level 1) and the daily post in a server (level 2) are built.

**A Discord Activity** (level 3): the site running inside a voice channel so a group planks to the same song together. This is the big one, and it builds on groups, which are built. YouTube playing inside Discord is a risk to check first. [Part 11](roadmap-parts/part-11-discord-activity.md) plans it.

**Size:** large.

## Not doing

- **A public XP leaderboard.** Everything runs on trust, so a public board would fill up with made-up numbers and turn a daily habit into a contest. Groups give people someone to plank with, among friends.
- **Apps in the App Store or Google Play.** The site on the home screen is the app: it opens full screen from its own icon, sends the daily reminders and updates itself. The site teaches how to add it on each phone and browser (`#install`). Store apps would have needed a Mac, a yearly fee, and store reviews that could turn down a fan app built around her name. [Part 10](roadmap-parts/part-10-native-app.md) keeps the research.

---

## Suggested order

| # | Feature | Size | Notes |
| --- | --- | --- | --- |
| 5 | Discord Activity | Large | Plan first |
