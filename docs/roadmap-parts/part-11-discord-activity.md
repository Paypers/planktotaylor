# Part 11: Discord Activity

The site running inside a Discord voice channel, so a group planks to the same song together.

**Builds:** roadmap §5, Discord level 3 · **Needs:** Parts 8 and 9 (groups) · **Size:** large, planned below as five smaller parts (11.1–11.5)

**Status:** researched and planned (September 2026). No app code yet. Feasibility is at the bottom: **about 80% for planking together to the same timer, about 30% for her song playing inside Discord.** One throwaway test (11.1) settles which.

## Decide first

- **Whether to build it.** Recommended: run the throwaway test (11.1) first, since its answer changes what gets built.
- **Check first: YouTube inside Discord.** Researched below: it's the one real unknown, and nothing published answers it. 11.1 is the test.
- **If YouTube can't play there:** build it anyway, as planking together to the same timer with everyone playing the song themselves? Recommended: yes. The shared countdown and finish are the point, and the site already works with music off.
- **What others see during the song.** Recommended: only that each person is planking, then ✓ or 🟩 at the end, as in groups. Nobody's breaks are shown live, even though each person's breaks are their own.

---

## What the research found

### What an Activity is

- A web app that Discord shows in a frame, in a voice or text channel, on desktop, web, iOS and Android ([Activities overview](https://docs.discord.com/developers/activities/overview)). It talks to Discord through the [Embedded App SDK](https://github.com/discord/embedded-app-sdk).
- [Open to all developers](https://www.androidpolice.com/discord-activities-now-open-to-all-developers/) since 2024. An Activity can be used in servers where its app is installed straight away. To be listed for everyone in the App Launcher it goes through verification in the Developer Portal.
- Sign-in: the SDK's `authorize` gives a code, a server swaps it for a token using the app's secret, and `authenticate` finishes it. Here the server is an Edge Function (`discord-token`), on Part 5's setup, with the secret as a function secret.
- Everyone who opens the Activity in the same channel shares an `instanceId`, and the SDK lists who's in it and says when people join or leave.

### The frame's rules

- Everything the Activity loads goes through Discord's proxy at `<app id>.discordsays.com`, under a strict Content Security Policy: "requests will fail with a `blocked:csp` error" unless they go through a **URL mapping** set up in the Developer Portal ([networking guide](https://docs.discord.com/developers/activities/development-guides/networking)). For example `/supabase` → `<project>.supabase.co`.
- Mappings can take parameters for changing addresses, like `/cdn/{subdomain}` → `{subdomain}.example.com` ([Photon's guide](https://doc.photonengine.com/realtime/current/connection-and-authentication/discord-activities)).
- The SDK's [`patchUrlMappings`](https://github.com/discord/embedded-app-sdk/blob/main/patch-url-mappings.md) rewrites the app's own `fetch`, WebSocket, XHR and `src` attributes to go through the mappings. It doesn't reach inside a frame the app puts on the page.
- WebSockets work through the proxy (so Supabase Realtime can). WebRTC doesn't.

### YouTube in there: the unknown

The site plays her songs with YouTube's embedded player: a frame from `youtube-nocookie.com`, which then loads its own scripts from `youtube.com`, thumbnails from `ytimg.com`, and the song itself from addresses like `rr3---sn-abcd.googlevideo.com` that change from play to play. Inside an Activity:

- A plain YouTube frame is most likely blocked by the policy outright.
- Through mappings (`/yt` → `www.youtube-nocookie.com`, `/ytimg` → `i.ytimg.com`, `/gv/{subdomain}` → `{subdomain}.googlevideo.com`, and so on), the player's page loads through the proxy. But its own scripts ask for YouTube's real addresses, which the mappings don't rewrite, so they'd be blocked unless they're patched from outside the frame. That's fragile, and YouTube changes its player often.
- YouTube also refuses to play when it can't tell which site it's on (["Error 153"](https://simonwillison.net/2025/Dec/1/youtube-embed-153-error/), since late 2025). Behind the proxy, the site it sees is `discordsays.com`, which may or may not be accepted.
- Discord's own Watch Together plays YouTube, but that's Discord's app with its own arrangement. Nothing published shows another app doing it.
- YouTube's rules still apply: the player stays visible, with nothing playing in the background ([policies](https://developers.google.com/youtube/terms/developer-policies)).

Nothing published answers this, so it takes a test.

---

## The plan, in parts

### 11.1 The throwaway test (for you to run in Discord)

A single test page, kept apart from the site, and a Discord application set up to show it:

1. In the [Developer Portal](https://discord.com/developers/applications): a new application, Activities turned on, and URL mappings: `/` → the test page's host, plus the YouTube mappings above.
2. The page tries three ways to play one track, in order: a plain YouTube frame; the frame through the mappings; the frame through the mappings with the addresses patched from outside. It shows on screen which way played, and any error code.
3. You open it in a voice channel on desktop, in the browser, and on a phone, and tell me what each one showed.

About an hour of your time, most of it the Developer Portal. I write the page and the steps when you want to run it. The result decides 11.3.

### 11.2 The Activity shell

- The same site, in an "activity" mode it turns on when Discord opens it (Discord adds `frame_id` and `instance_id` to the address). No separate app to keep in step.
- The SDK: wait for Discord, sign in with Discord (`identify`), and the `discord-token` Edge Function for the swap. Names and photos come from Discord.
- Supabase through a mapping (`/supabase`), by giving supabase-js the proxy's address when in activity mode.
- **Schema change:** none. **Size:** medium.

### 11.3 Plank together

- One shared session for everyone in the channel (`instanceId`): today's song by default, anyone can press Start, and everyone gets the same 3-second countdown and starts at the same moment. The shared state goes over a Supabase Realtime channel named after the instance. The start is sent as a time, so small differences in delay don't matter.
- Each person's breaks are their own: a break pauses their timer (and song), and they finish when they finish.
- During the song, each person just shows as planking. At the end: ✓, or 🟩 with no breaks, the same as groups. Nothing ranks anyone.
- **The music**, depending on 11.1:
  - YouTube works: everyone's player starts the song at the shared start, and nudges back into step if it drifts.
  - YouTube doesn't work: the timer runs for the song's length and shows what's playing ("Wood · 2:31"); everyone plays the song themselves. The shared countdown and finish are still the point.
- **Size:** large.

### 11.4 Counting it on your account

- A plank in Discord counts for your streak and your groups when you're signed in to Plank to Taylor there: sign in once inside the Activity with the emailed code (the same form as the site; the link wouldn't come back to Discord). It stays signed in on that device.
- Signed out, it works just the same, without saving: the same as the site signed out.
- Linking Discord accounts to Plank to Taylor accounts properly (signing in *with* Discord) is possible later through Supabase's Discord sign-in, but isn't needed to start.
- **Size:** small to medium.

### 11.5 Going public

- A privacy page and terms (neither is written yet), then verification in the Developer Portal to be listed in the App Launcher.
- Until then it works in any server where it's installed, which covers your own servers and friends'.

---

## How feasible it is

| Piece | Feasible | Why |
| --- | --- | --- |
| 11.1 The test | 100% | It only has to give an answer. |
| 11.2 The shell (Discord sign-in, the site inside Discord, Supabase through the proxy) | 90% | Standard, documented, and on Part 5's setup. |
| 11.3 Planking together to one timer | 85% | Realtime over WebSockets is supported; the timer already exists. |
| 11.3 With her song playing inside Discord | 30% | Blocked by default, the player's own requests aren't rewritten by the mappings, song addresses change, and Error 153. Settled by 11.1. |
| 11.4 Counting it on your account | 85% | The code sign-in already exists; storage inside Discord's frame on phones is the only doubt. |
| **As planned, with the music** | **about 30%** | |
| **As planned, planking together without the music inside Discord** | **about 80%** | |

**Recommendation:** run 11.1 first. Whatever it shows, planking together to one countdown is worth building. The music inside Discord is a bonus if the test says it works.

## Sources

- [Discord: Activities overview](https://docs.discord.com/developers/activities/overview), [networking and URL mappings](https://docs.discord.com/developers/activities/development-guides/networking), [Embedded App SDK](https://github.com/discord/embedded-app-sdk), [patchUrlMappings](https://github.com/discord/embedded-app-sdk/blob/main/patch-url-mappings.md)
- [Parameter mappings for changing subdomains (Photon)](https://doc.photonengine.com/realtime/current/connection-and-authentication/discord-activities)
- [Activities open to all developers (Android Police)](https://www.androidpolice.com/discord-activities-now-open-to-all-developers/)
- [YouTube Error 153 (Simon Willison)](https://simonwillison.net/2025/Dec/1/youtube-embed-153-error/), [YouTube API Services developer policies](https://developers.google.com/youtube/terms/developer-policies)
