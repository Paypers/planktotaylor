# Part 11: Discord Activity

The site running inside a Discord voice channel, so a group planks to the same song together.

**Builds:** roadmap §5, Discord level 3 · **Needs:** Parts 8 and 9 (groups) · **Size:** large

## Decide first

- **Whether to build it.** The roadmap left the Discord level open. This is the big one.
- **Check first: YouTube inside Discord.** An Activity runs in a frame behind Discord's proxy, with strict rules on what it can load. If the YouTube player can't play there, this doesn't work as planned. Before anything else, build a throwaway Activity that plays one track.

---

## Once it's decided

**Decided:** not built yet. The first session researches Discord's current Activity rules and limits, writes the plan into this file (split into parts like the others), and ends with a summary of how feasible it is, as a percentage. It can include the throwaway test Activity for the person to run in Discord. No app code. The pieces known so far:

- Discord's Embedded App SDK, a Discord application, and a sign-in exchange on the server (an Edge Function, on the setup from Part 5).
- Everyone in the voice channel gets the same song and the same countdown and starts together. Each person's breaks are their own.
- It fits with groups: a voice channel is a group for the length of a song.
- The same rules apply: nothing ranks people by breaks.
