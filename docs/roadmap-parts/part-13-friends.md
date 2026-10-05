# Part 13: Friends

Add people as friends, see who's online and who's planking right now, and pull them into a plank or a group with one tap. On a computer, the home page moves left to make room for a friends list down the right, like Discord's member list. A friends page holds the rest.

**Builds:** friends, from requests to planking together · **Needs:** accounts, Parts 8 and 9 (groups), Part 12 (plank together), Part 5 (push, for 13.5) · **Schema change:** yes · **Size:** large, in five smaller parts (13.1–13.5)

## What friends add that groups don't

Groups are teams: a shared streak, an invite link, up to 50 people. Friends are one to one. They give you:

- **Who's around:** a green dot while a friend has the site open, and "Planking now" while they plank.
- **A quick way to plank together:** invite friends straight into a plank-together room or one of your groups, with no link to pass around.
- **Your people in one place:** everyone you plank with, across all your groups, in one list.

Friends have no streak of their own and nothing that ranks them. A group is still how a set of friends keeps a streak together.

## Decided

- **Finding someone.** Each player has a friend code, 8 letters and digits with no look-alikes (`K7QM-3XPD`), and a friend link, `#friend/<code>`. You can also add people you share a group with, and signed-in people in a plank-together room with you. There's no search and no list of players, so nobody can be looked up by name. Making a new code stops the old one working.
- **Requests.** Send one, and they accept or decline. Declining is quiet: the request just goes from the sender's list. The sender can cancel. Two people who send each other a request at once become friends straight away. Either friend can remove the other.
- **Blocking.** Blocking someone removes the friendship and any requests both ways. Their requests and invites to you then quietly go nowhere, and they're never told. Unblock from the friends page.
- **What friends see of you:** the same as a group does. Your name, photo, online or planking now, your streak, and whether you've planked today's song (✓, or 🟩 with no breaks), with when ("Planked Peter · 20 min ago"). Never breaks, XP, rank, attempts or the ladder.
- **Online.** The dot is green while the site is open in front of you: the site checks in every 45 seconds, and you count as online for 2 minutes after the last check-in. You're "Planking now" while the plank screen is on, the same as in groups. **Settings → Friends → Show when I'm online** is on by default. Turned off, friends see you as offline, never planking, with no time on what you planked. You still see theirs.
- **Invites.** "Plank with friends" sends a room invite. It's in a room's lobby, and on each friend's row as "Plank together", which makes a room with today's song. "Invite friends" on a group's page sends a group invite. Invites show at the top of the friends list, with Join or Not now. A room invite lasts 30 minutes, and a group invite 7 days. Joining a group from an invite follows the group's own limits.
- **Push.** An invite also reaches the friend's phone if they've turned daily reminders on, with at most one push from the same friend every 10 minutes. Settings → Reminders gets an "Invites from friends" switch, on by default.
- **Activity.** A line under each friend: "Planking now", "Planked Peter · 20 min ago" (today's song only), "Online", or "Seen 3 hours ago". It never says anything about breaks.
- **Limits:** 200 friends each, 50 requests waiting at once, 30 requests sent a day, one open invite per friend for each room or group, and 50 invites sent an hour.
- **For signed-in players with a name,** as groups are.

## The layout

- **Wide screens (1200px and up), signed in:** the page's content moves left, and a friends rail 280px wide sits on the right, under the header. It stays in view as the page scrolls, and scrolls on its own when it's long. From the top:
  - **Invites**, each with Join and Not now.
  - **Requests waiting**, as a line that opens the friends page.
  - **Up to 10 friends:** planking now first, then online, then most recently seen. A friend who hides their online status comes after, by when you became friends. Each row has their photo with a status dot, their name, the activity line, and ✓ or 🟩 for today's song. A row opens the friend's card: streak, today, groups you share, Plank together, Invite to a group, Remove, Block.
  - **All friends (23)**, which opens the friends page, and **Add a friend**.
- **Narrower screens, or signed out:** no rail. Signed in, the header gets a Friends button showing how many are online. It opens the friends page.
- **The friends page** (`#friends`), with tabs as on Discord, each at its own address: All · Online · Pending (in and out) · Blocked · Add a friend. All comes first: on a small site most friends are offline, and an empty Online tab would look broken. Add a friend shows your code and link, with Copy and Share, a box to type someone's code, and "People you plank with": members of your groups who aren't friends yet.
- **A friend link** (`#friend/<code>`) shows the person's name and photo and a Send request button. Signed out, it's kept through sign-in, as group invite links are.

## How it works

- **Tables** (in [schema.sql](../../supabase/schema.sql), safe to run again), all with RLS on and no writes from the site except through functions:
  - `friend_profiles`: each player's code, whether they show online, when they were last seen, and until when they're planking.
  - `friendships`: one row per pair, with the smaller id first, and since when.
  - `friend_requests`, `friend_blocks`, `friend_invites` (a room's code and song, or a group, and when it expires).
- **Functions**, `security definer`, each checking the caller: `my_friend_code`, `new_friend_code`, `friend_lookup(code)`, `request_friend(code)` and `request_friend_from_group(user)`, `answer_friend_request`, `cancel_friend_request`, `remove_friend`, `block_player`, `unblock_player`, `set_show_online`, `invite_friends`, `dismiss_invite`, `accept_group_invite`, `friend_suggestions`, and `friends_now(today, planking)`. The site calls `friends_now` every 45 seconds while it's in view. It checks the player in and returns everything the rail needs in one go: friends, requests, invites and blocks.
- **The fast path.** Each player has a private Realtime channel, `friend-inbox:<id>`. Only they can listen, and only their friends, or someone they've had a request from, can send to it. A request, an answer or an invite sends a nudge there with nothing in it, and the friend's site checks in at once instead of waiting up to 45 seconds. Online dots don't need it, so they ride the check-in.
- **The rules test.** [rules-test.sql](../../supabase/rules-test.sql) gets a friends section: a stranger sees nothing, friends see only the fields above, a blocked player's requests and invites go nowhere, hiding your online status hides it, and the limits hold.

## The parts

### 13.1 The database, and the site's side of it

- The tables, functions and Realtime rules above, and the rules test.
- `src/lib/friends.ts`, pure and tested: friend codes (making them readable, reading them back from a link or a typed code), the order of the rail, the activity line, and the problems the database can report.
- The calls in [account.ts](../../src/lib/account.ts).

### 13.2 The friends page

- `#friends` with its tabs, and `#friend/<code>`.
- Requests, answers, removing and blocking, and making a new code.
- The friend card (moved here from 13.3: the list needs somewhere for Remove and Block).
- Settings → Friends → Show when I'm online. (There's no Account section in Settings, so friends got their own.)
- Help page: friends, and exactly what friends see.

### 13.3 The rail, and who's online

- The friends rail on wide screens, and the header button on narrow ones. (Built: the rail shows on every page but the friends page, a room and Your Plank Year. Under 414px the header's icon buttons narrow to 30px so the site's name still fits beside the new button on phones 390px and up.)
- Checking in every 45 seconds while the page is in view, on every page, and planking now from the plank screen.

### 13.4 Planking together with friends

- Invites: Plank with friends in a room's lobby, Plank together on a friend, Invite friends on a group's page, and Join or Not now in the rail.
- The friend inboxes on Realtime.
- Adding people from your groups, and from a plank-together room (each signed-in person's friend code goes in the room's presence).

### 13.5 Invites on your phone, and the check

- Invites as pushes, through the reminders' push: a database trigger calls an Edge Function, which sends to the friend's devices that have reminders on. At most one from the same friend every 10 minutes.
- Settings → Reminders → Invites from friends.
- README, and the check: two or three accounts on a phone and a computer, trying requests, blocking, online, planking now, room and group invites, and the pushes.

---

## Done when

- [ ] The rules test covers strangers, friends, blocking, hiding online and the limits, and passes.
- [ ] `npm test` and `npm run build` pass after each part.
- [ ] Tried with two or three accounts in two browsers, and on a phone.
- [ ] Nothing shows breaks, XP or rank, and nothing ranks friends.
- [ ] Help page and README updated. ✓ in the index.

## For you, after each part with a schema change

- Run [schema.sql](../../supabase/schema.sql) before pushing, then [rules-test.sql](../../supabase/rules-test.sql).
- 13.5: deploy the new Edge Function (`npm run functions:deploy` picks it up) and run schema.sql for its trigger.
