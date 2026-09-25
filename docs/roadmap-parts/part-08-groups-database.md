# Part 8: Groups, the database and joining

The biggest gap: right now nobody on the site can see anyone else. Friends and groups is the largest feature, so it's split in two. This part builds the tables, the database rules, and joining from an invite link. [Part 9](part-09-groups-page.md) builds the group page.

**Builds:** roadmap §9, first half · **Needs:** Part 1 (group streaks use freezes) · **Schema change:** yes

This is the first time one player can read another player's data, so the database rules are what this part has to get right. Every rule today lets a player see only their own rows. Keep it that way for every table, and add one narrow way in for groups.

## Decided

- **Two kinds of group.**
  - **Private:** the group streak grows on days everyone planks. On a day someone misses, a freeze is used, on the same rules as a person's streak: 3 a month, at most 2 missed days in a row.
  - **Public:** looser. The group streak carries on as long as at least one member planks that day. The page shows who contributed, most to least. Contributions count planks, never breaks.
  - **Public means viewable by link:** anyone with a public group's link, signed in or not, can see its name, how many members it has, the group streak and this month's contributors (each member's name, photo and how many days they planked). Neither kind is listed anywhere, so there's nothing to moderate. A private group shows non-members nothing: signed out, its link only says "Sign in to join this group"; signed in, it shows the name and member count before joining.
  - **Contributors** count the days each member planked today's song this calendar month, at most one a day, most first. They reset on the 1st.
  - **50 members** for both kinds.
  - **The kind is chosen when the group is made** and never changes, so the group streak always means the same thing.
  - Proposed, to confirm before Part 9: both kinds use freezes the same way (3 a month, at most 2 missed days in a row). A private group's day counts when everyone planked; a public group's when anyone did.
- **Who counts as "everyone":** the members who had joined by that day, so a new member neither breaks the streak nor rides on it. Built as: each member keeps the day they joined in their own time zone (`joined_on`). In a private group a day needs everyone who joined *before* it, so joining late in the day never breaks it; in a public group, and for contributions, a plank counts from the joining day on.
- **When the maker leaves,** the member who joined first takes over, so there's always someone who can rename the group, make a new link and remove members.
- **Limits:** at most 50 members in a group, and 10 groups per player.
- **Who can do what:** anyone in a group can share its invite link. The person who made it can rename it, make a new link (the old one stops working) and remove members. Anyone can leave, and when the last member leaves the group is deleted.

---

## Tables and rules

In [schema.sql](../../supabase/schema.sql), safe to run again:

- `groups`: id, name (40 characters at most), invite code, made by, created at. The invite code is random and long enough not to be guessed (16 characters or more), and unique.
- `group_members`: group, user, joined at. The primary key is the group and user together.
- RLS: members can read their own groups and those groups' member lists. There are no direct inserts. Making a group goes through `create_group(name)` and joining through `join_group(code)`. Both are `security definer`, and both check the limits.
- **The one narrow way in:** a `security definer` function, for example `group_board(group_id)`. It checks the caller is a member, then returns, for each member, only:
  - name and photo link;
  - the days they planked today's song (for streaks);
  - whether today's was held with no breaks (for 🟩).

  Never pause counts, pause positions, XP, attempts or the ladder.
- A player without a display name needs one to show in a group. Ask for it when they join or make a group.
- **Test the rules** with three accounts: A and B in a group, C not in it. C can't read the group, its members or its board. A can't read B's `plank_completions` directly. The board has only the fields above. Write it as a SQL script in `supabase/` that the person can run against a test project, since Claude can't reach the database.

## Joining, on the site

- Groups are for signed-in players.
- An invite link, for example `https://planktotaylor.pages.dev/#join/<code>`, handled in [route.ts](../../src/lib/route.ts).
- **Signed out:** sign in first, then join. The magic link comes back to the Site URL and loses the `#join/<code>` part, so keep the code in the browser before sign-in and join once sign-in finishes.
- Make a group, share its invite link (through the share flow that already exists), leave a group. A plain list of your groups and their members is enough for this part; Part 9 makes the real page.
- The calls go in [account.ts](../../src/lib/account.ts). Groups live in the account, not the browser.
- Help page: exactly what the rest of a group sees of you (name, photo, whether you've planked today's song and whether it was with no breaks, your streak). README: the security section gets the new rule.

---

## Done when

- [ ] The SQL test script covers the three-account checks above.
- [ ] `npm test` and `npm run build` pass.
- [ ] Tried in two browsers with two accounts: make a group, join from the link (signed out first, then signed in), leave, rejoin.
- [ ] Help page and README updated.
- [ ] Nothing removed from roadmap.md yet (§9 comes out after Part 9). ✓ in the index.

## For you, after this part

- Run [schema.sql](../../supabase/schema.sql), then the test script against a test project (or with three test accounts).
