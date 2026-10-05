import { formatDuration, SONG_BY_ID } from '../data/songs'

// An invite from a friend, as a push to their phone (supabase/functions/send-invite, built into _shared/site.js).
// Only for devices with daily reminders on and Invites from friends left on, at most one from the same friend
// every 10 minutes (schema.sql). Tapping it opens the room, or the friends list where a group's invite waits.

export interface InvitePushInput {
  /** The friend who sent it, as their friends see them. */
  from: string
  kind: 'room' | 'group'
  roomCode: string | null
  songId: string | null
  groupId: string | null
  groupName: string | null
}

export interface InvitePush {
  title: string
  body: string
  /** Where tapping it goes on the site: a room's address, or the friends list. */
  hash: string
  /** Notifications with the same tag replace each other: the latest room invite, each group's latest. */
  tag: string
}

const ROOM_CODE = /^[a-z0-9]{10}$/

/** A name on one line, cut to fit a notification. */
const shortName = (name: string) => (name.replace(/\s+/g, ' ').trim() || 'A friend').slice(0, 40)

/** What the push says and where it goes. Null for an invite with nothing to open (a song or room that isn't one). */
export function invitePush(input: InvitePushInput): InvitePush | null {
  const from = shortName(input.from)
  if (input.kind === 'room') {
    const song = input.songId ? SONG_BY_ID.get(input.songId) : undefined
    if (!song || !input.roomCode || !ROOM_CODE.test(input.roomCode)) return null
    return {
      title: `${from} invited you to plank`,
      body: `${song.title} (${formatDuration(song.seconds)}), together, now. Tap to join them.`,
      hash: `#together/${input.roomCode}/${song.id}`,
      tag: 'invite-room',
    }
  }
  if (!input.groupId || !input.groupName) return null
  return {
    title: `${from} invited you to ${input.groupName}`,
    body: 'Tap to join the group, or say not now, in your friends list.',
    hash: '#friends',
    tag: `invite-group-${input.groupId}`,
  }
}
