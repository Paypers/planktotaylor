import { SONG_BY_ID } from '../data/songs'

// Friends (signed-in players with a name): one to one, found by a friend code or through a group you share.
// The rules live in the database (supabase/schema.sql, checked by supabase/rules-test.sql); what's here is
// the site's side of them. A friend sees what a group does, plus online and planking now: never breaks, XP,
// rank, attempts or the ladder. docs/roadmap-parts/part-13-friends.md has the plan.

/** Friends each, at most. schema.sql has the same limit: keep them in step. */
export const FRIENDS_EACH = 200
/** Requests waiting at once, and sent a day, at most. schema.sql has the same limits. */
export const REQUESTS_WAITING = 50
export const REQUESTS_A_DAY = 30
/** Friends shown in the rail on a computer, at most: the rest are on the friends page. */
export const RAIL_FRIENDS = 10
/** How often the site checks in while it's in view. Friends count as online for 2 minutes after (schema.sql). */
export const CHECK_IN_MS = 45_000

/** A friend code: 8 letters and digits with no look-alikes (no 0, O, 1 or I). FRIEND_CODE in schema.sql too. */
const FRIEND_CODE = /^[2-9A-HJ-NP-Z]{8}$/

/** The code from a friend link (`…#friend/K7QM-3XPD`), or as typed or pasted, tidied. Null if it can't be one. */
export function readFriendCode(text: string): string | null {
  const fromLink = /#friend\/([^/?#\s]+)/i.exec(text)?.[1] ?? text
  const code = fromLink.replace(/[^0-9a-z]/gi, '').toUpperCase()
  return FRIEND_CODE.test(code) ? code : null
}

/** A code as it's shown and read out: K7QM-3XPD. */
export const showFriendCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** A friend, as the friends list shows them. Times are ISO strings from the database. */
export interface Friend {
  user_id: string
  name: string
  avatar_url: string | null
  /** When you became friends. */
  since: string
  /** The site open in front of them in the last 2 minutes. Always false for a friend hiding it. */
  online: boolean
  /** Their plank screen is on. Always false for a friend hiding it. */
  planking: boolean
  /** When the site last checked in for them. Null for a friend hiding it. */
  seen_at: string | null
  /** When they planked today's song. Null if they haven't, or they hide it. */
  planked_at: string | null
  planked_today: boolean
  /** Today's held with no breaks (🟩); null when they haven't planked it. */
  clean_today: boolean | null
  /** Today's song, once they've planked it. */
  planked_song: string | null
}

/** Someone in a list of requests or blocks. */
export interface Person {
  user_id: string
  name: string
  avatar_url: string | null
  /** When the request was sent. */
  at?: string
}

export interface FriendInvite {
  id: string
  from_user: string
  name: string
  avatar_url: string | null
  kind: 'room' | 'group'
  /** A room's code and song. */
  room_code: string | null
  song_id: string | null
  /** A group's id and name. */
  group_id: string | null
  group_name: string | null
  at: string
  expires_at: string
}

/** Everything the friends list shows, from one check-in. */
export interface FriendsNow {
  /** Null until the player has a name: friends see it. */
  code: string | null
  show_online: boolean
  friends: Friend[]
  requests_in: Person[]
  requests_out: Person[]
  blocked: Person[]
  invites: FriendInvite[]
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const flag = (value: unknown) => value === true

function readPerson(value: unknown): Person | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const id = text(v.user_id)
  if (!id) return null
  const at = text(v.at)
  return { user_id: id, name: text(v.name) ?? 'A planker', avatar_url: text(v.avatar_url), ...(at ? { at } : {}) }
}

function readFriend(value: unknown): Friend | null {
  const person = readPerson(value)
  if (!person) return null
  const v = value as Record<string, unknown>
  return {
    user_id: person.user_id,
    name: person.name,
    avatar_url: person.avatar_url,
    since: text(v.since) ?? '',
    online: flag(v.online),
    planking: flag(v.planking),
    seen_at: text(v.seen_at),
    planked_at: text(v.planked_at),
    planked_today: flag(v.planked_today),
    clean_today: typeof v.clean_today === 'boolean' ? v.clean_today : null,
    planked_song: text(v.planked_song),
  }
}

function readInvite(value: unknown): FriendInvite | null {
  const person = readPerson({ ...(value as object), user_id: (value as Record<string, unknown> | null)?.from_user })
  if (!person) return null
  const v = value as Record<string, unknown>
  const id = text(v.id)
  const kind = v.kind === 'room' || v.kind === 'group' ? v.kind : null
  if (!id || !kind) return null
  const invite: FriendInvite = {
    id,
    from_user: person.user_id,
    name: person.name,
    avatar_url: person.avatar_url,
    kind,
    room_code: text(v.room_code),
    song_id: text(v.song_id),
    group_id: text(v.group_id),
    group_name: text(v.group_name),
    at: text(v.at) ?? '',
    expires_at: text(v.expires_at) ?? '',
  }
  const usable = kind === 'room' ? invite.room_code && invite.song_id && SONG_BY_ID.has(invite.song_id) : invite.group_id && invite.group_name
  return usable ? invite : null
}

const list = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.flatMap((item) => read(item) ?? []) : []

/** The database's answer to a check-in, with anything that isn't what it should be left out. */
export function readFriendsNow(value: unknown): FriendsNow | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.friends)) return null
  return {
    code: text(v.code),
    show_online: v.show_online !== false,
    friends: list(v.friends, readFriend),
    requests_in: list(v.requests_in, readPerson),
    requests_out: list(v.requests_out, readPerson),
    blocked: list(v.blocked, readPerson),
    invites: list(v.invites, readInvite),
  }
}

/**
 * planking  their plank screen is on
 * online    the site is open in front of them
 * offline   neither, or they hide it
 */
export type FriendStatus = 'planking' | 'online' | 'offline'

export const friendStatus = (friend: Friend): FriendStatus => (friend.planking ? 'planking' : friend.online ? 'online' : 'offline')

const STATUS_ORDER: Record<FriendStatus, number> = { planking: 0, online: 1, offline: 2 }

/**
 * The list's order: planking now, then online, then most recently seen. Friends who hide when they're online
 * come after, newest friends first. Ties go by name, the same way every time.
 */
export function friendsInOrder(friends: readonly Friend[]): Friend[] {
  return [...friends].sort(
    (a, b) =>
      STATUS_ORDER[friendStatus(a)] - STATUS_ORDER[friendStatus(b)] ||
      Number(b.seen_at !== null) - Number(a.seen_at !== null) ||
      (b.seen_at ?? b.since).localeCompare(a.seen_at ?? a.since) ||
      a.name.localeCompare(b.name),
  )
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(then: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(then)) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * The line under a friend's name: what they're doing, or did today. Planking now; today's song planked (with
 * when, unless they hide it); online; or when they were last seen. Never anything about breaks.
 */
export function activityLine(friend: Friend, now: number): string {
  if (friend.planking) return 'Planking now'
  const song = friend.planked_song ? SONG_BY_ID.get(friend.planked_song)?.title : undefined
  if (friend.planked_today && song) return friend.planked_at ? `Planked ${song} · ${timeAgo(friend.planked_at, now)}` : `Planked ${song}`
  if (friend.online) return 'Online'
  return friend.seen_at ? `Seen ${timeAgo(friend.seen_at, now)}` : 'Offline'
}

/** Why a friends call was refused, from the database's message. */
export type FriendProblem =
  | 'sign-in'
  | 'name'
  | 'not-found'
  | 'yourself'
  | 'blocked'
  | 'too-many-friends'
  | 'too-many-waiting'
  | 'too-many-today'
  | 'too-many-invites'
  | 'not-in-group'
  | 'unavailable'

export function friendProblem(message: string | undefined): FriendProblem {
  if (!message) return 'unavailable'
  if (message.includes('sign in first')) return 'sign-in'
  if (message.includes('a name first')) return 'name'
  if (message.includes('no such friend code') || message.includes('no such request') || message.includes('no such invite')) return 'not-found'
  if (message.includes('your own code') || message.includes("that's you")) return 'yourself'
  if (message.includes('unblock them first')) return 'blocked'
  if (message.includes('too many friends')) return 'too-many-friends'
  if (message.includes('too many requests waiting')) return 'too-many-waiting'
  if (message.includes('too many requests today')) return 'too-many-today'
  if (message.includes('too many invites')) return 'too-many-invites'
  if (message.includes('not in a group with them') || message.includes('not in this group')) return 'not-in-group'
  return 'unavailable'
}

// A friend link followed while signed out is kept here through sign-in: the magic link comes back to the
// site's front page, without the #friend/<code> it left from. As group invite links are (groups.ts).
const KEPT_KEY = 'plank-to-taylor:friend'
/** A kept link older than this is forgotten: signing in days later is for something else. */
const KEPT_MS = 24 * 60 * 60 * 1000

export function keepFriendCode(code: string, now = Date.now()) {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify({ code, at: now }))
  } catch {
    // Private mode: the friend link still works when it's opened again after signing in.
  }
}

/** The friend code kept through sign-in, if there's a recent one. */
export function keptFriendCode(now = Date.now()): string | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null
    if (!kept || typeof kept.code !== 'string' || typeof kept.at !== 'number' || now - kept.at > KEPT_MS) return null
    return readFriendCode(kept.code)
  } catch {
    return null
  }
}

export function forgetFriendCode() {
  try {
    localStorage.removeItem(KEPT_KEY)
  } catch {
    // Nothing kept, then.
  }
}
