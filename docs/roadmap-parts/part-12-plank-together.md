# Part 12: Plank together

Send friends a link, everyone opens it, and you all plank to the same song at the same moment. When anyone pauses, everyone pauses. When anyone carries on, everyone gets a 3-2-1 and carries on together. At the end there's one share for the whole room, as a card and as text.

**Builds:** planking together on the site, from a link · **Needs:** accounts set up (Supabase), Parts 8 and 9 for the button on a group's page · **Size:** large, in four smaller parts (12.1–12.4)

**Status:** built September 2026. Part 11 (the Discord Activity) can reuse this part's room later.

## Decided

- **Who can join:** anyone with the link. Someone signed out types a name. Their plank saves in their browser like any other plank. Signed in, it counts on their account.
- **Whose record gets a break:** only whoever pressed Pause. Everyone else keeps their no-break bonus, so nobody is blamed for costing the room. The room's shared bar still shows every pause.
- **What the others see while paused:** just "Paused", with nobody named. This follows the rule that breaks are private. Anyone can press Continue, which gives everyone a 3-2-1.
- **This differs from Part 11,** which planned for each person's breaks to be their own. The link version pauses everyone, because that's what planking *together* means here.

## How it works

- **The room** is a Supabase Realtime channel, `plank-together:<code>`, with a random 10-character code. Nothing goes in the database: the room lasts as long as someone's in it. Presence says who's there, updated at most every 12 seconds (Supabase drops a device that updates it about 6 times in 30 seconds). Broadcast carries Start, Pause, Continue and each person's status. A device that loses the room rejoins by itself.
- **The link:** `#together/<code>/<song id>`. The song is in the link, so anyone opening it knows the song without asking anyone. It's today's song by default, and whoever makes the room can pick another.
- **One clock for the room.** Every device keeps the room's position in the song from the commands it receives. The person who has been in the room longest (the host) sends where they are every few seconds, and anyone more than a second out moves back into step. Each person's timer follows the room's clock. Their YouTube player follows the timer, and seeks when it drifts.
- **Commands are numbered,** so two presses at once settle the same way on every device. Someone joining mid-plank is told where the room is. They can watch, and join the next round.
- **Counting it:** each person's plank goes through the same `finish()` as planking alone, with only their own breaks. So today's song keeps your streak, your ladder level climbs, XP is paid as usual, and it goes in your history. What it counts for is worked out per person: today's song, your ladder level, a level you've climbed (practice), or a new release.
- **Nothing ranks anyone.** During the song each person shows as planking, or ✓ when they're done. The room's share names everyone who held to the end, and never who stopped or who paused.
- **The Content Security Policy** gains `wss://*.supabase.co` in `connect-src`, since Realtime uses a WebSocket.

## The parts

### 12.1 The room and the lobby

- `src/lib/live/`: the room (pure and tested: numbering, the clock, the host, late joiners), the Realtime wiring, room codes, and the name a guest types.
- The route `#together/<code>/<song>`, and the lobby page: your name, who's here, the song, Copy link and Share (`navigator.share`), and Start together.
- "Plank together" buttons: on the home page beside today's song, and on a group's page. Each makes a room and opens its lobby.

### 12.2 The plank screen, together

- `PlankTimer` gets a live mode. Start, Pause and Continue go to the room, the timer runs on the room's clock, and the song follows it. A pause from someone else stops you without a break on your record.
- A strip with everyone in the room: planking, or ✓.
- Phones that only play a song after a tap on the video (iPhones) show the existing "tap ▶" hint. The timer keeps the room's time either way, and the song jumps to the right place when it starts.

### 12.3 The room's share

- The text: the song, how many planked it together, the room's green and orange squares, the names, and the link.
- The card: the same printed style as the plank card, "5 planked together", the song, the room's bar labelled like the plank card, and the names.

### 12.4 Help, README, and the check

- The help page and README explain planking together.
- The check: two or three browsers in one room, on a phone and desktop, trying start, pause, continue, giving up, joining late and the share.

**By hand:** in Supabase → Realtime → Settings, make sure public channels are allowed. No `schema.sql` change.
