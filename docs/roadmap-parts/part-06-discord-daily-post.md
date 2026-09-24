# Part 6: Discord daily post

A server admin pastes a Discord webhook into the site. Each morning it posts today's song, and each night today's stats. There's no bot to host.

**Builds:** roadmap §5, Discord level 2 · **Needs:** Part 2 (today's stats) and Part 5 (scheduled functions) · **Schema change:** yes

## Decided

- **Build it.** Level 1, sharing a result, already works: the text share and the link preview card both show up fine in Discord. This part is level 2. Level 3, the Activity, is [Part 11](part-11-discord-activity.md).
- **When posts go out:** each server picks a time zone when it signs up (the admin's browser zone to start with). The morning post goes at 8:00 and the stats at 21:00, local to that zone.
- **Who can add one:** signed-in players only, at most 3 webhooks each. That's the first rate limit.

---

## Pieces

- **Sign-up:** a small page (for example `#discord` in [route.ts](../../src/lib/route.ts), linked from the help page) where an admin pastes a webhook URL.
  - Only accept `https://discord.com/api/webhooks/<id>/<token>` (and `discordapp.com`). Nothing else is ever fetched.
  - On sign-up, post a short "Plank to Taylor will post here each day" message to check it works, and refuse the webhook if that fails.
- **Table `discord_webhooks`:** the URL, time zone, who added it, created at.
  - **A webhook URL is a secret:** anyone who has one can post to that channel. The site never reads them back. RLS lets nobody select them, and adding and removing go through `security definer` functions (or an Edge Function). The person who added one can remove it.
- **Rate limits,** enforced in the database or function, not only in the form: per account (above), and a site-wide cap on sign-ups per hour.
- **Scheduled function,** on the same setup as Part 5's reminders:
  - Morning: "Today's song: Style (3:51) · Plank along: https://planktotaylor.pages.dev".
  - Night: today's stats, the friendly version from Part 2 only: how many planked, time together, the 🟩 count, the toughest stretch. Never break counts or percentages.
  - Discord answers 404 or 401 for a deleted webhook: remove it. On 429, wait as long as Discord says before trying again.
- Help page: how to add the daily post to a server. README: the setup.

---

## Done when

- [ ] Tests for the URL check and for who's due now; `npm test` and `npm run build` pass.
- [ ] Tried against a test Discord server: sign-up posts its check message, a bad URL is refused, both daily posts arrive.
- [ ] Webhook URLs can't be read back through the API with the site's key.
- [ ] Help page and README updated.
- [ ] roadmap.md: Discord level 2 removed from §5. ✓ in the index.

## For you, after this part

- Run [schema.sql](../../supabase/schema.sql), deploy the function, and set its schedule and secrets the same way as Part 5.
- Add a webhook for a test Discord server and wait for (or trigger) both posts.
