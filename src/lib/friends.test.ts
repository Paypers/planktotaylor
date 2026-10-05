import { describe, expect, it } from 'vitest'
import { activityLine, friendProblem, friendsInOrder, readFriendCode, readFriendsNow, showFriendCode, timeAgo, type Friend } from './friends'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString()

const friend = (name: string, fields: Partial<Friend> = {}): Friend => ({
  user_id: name.toLowerCase(),
  name,
  avatar_url: null,
  since: '2026-09-01T00:00:00Z',
  online: false,
  planking: false,
  seen_at: null,
  planked_at: null,
  planked_today: false,
  clean_today: null,
  planked_song: null,
  ...fields,
})

describe('friend codes', () => {
  it('reads a code however it comes: typed loosely, pasted, or in a link', () => {
    expect(readFriendCode('K7QM-3XPD')).toBe('K7QM3XPD')
    expect(readFriendCode(' k7qm 3xpd ')).toBe('K7QM3XPD')
    expect(readFriendCode('https://planktotaylor.pages.dev/#friend/K7QM-3XPD')).toBe('K7QM3XPD')
    expect(readFriendCode('planktotaylor.pages.dev/#friend/k7qm3xpd')).toBe('K7QM3XPD')
  })

  it("turns away anything that can't be one", () => {
    expect(readFriendCode('')).toBeNull()
    expect(readFriendCode('K7QM-3XP')).toBeNull()
    expect(readFriendCode('K7QM-3XPDD')).toBeNull()
    // No look-alikes in a code: 0, O, 1 and I never appear.
    expect(readFriendCode('K7QM-3XP0')).toBeNull()
    expect(readFriendCode('K7QM-3XPI')).toBeNull()
  })

  it('shows a code in two halves, to read out', () => {
    expect(showFriendCode('K7QM3XPD')).toBe('K7QM-3XPD')
  })
})

describe("the database's answer", () => {
  it('keeps what it knows, and leaves out anything broken', () => {
    const now = readFriendsNow({
      code: 'K7QM3XPD',
      show_online: true,
      friends: [{ user_id: 'fay', name: 'Fay', avatar_url: null, since: 'x', online: true, planking: false, clean_today: false, planked_today: true, xp: 900 }, { name: 'No id' }],
      requests_in: [{ user_id: 'gus', name: 'Gus', avatar_url: null, at: 'y' }],
      requests_out: 'nonsense',
      blocked: [],
      invites: [
        { id: 'i1', from_user: 'fay', name: 'Fay', kind: 'room', room_code: 'abcdefghij', song_id: 'style', at: 'z', expires_at: 'z' },
        { id: 'i2', from_user: 'fay', name: 'Fay', kind: 'room', room_code: 'abcdefghij', song_id: 'not-a-song', at: 'z', expires_at: 'z' },
        { id: 'i3', from_user: 'fay', name: 'Fay', kind: 'party', at: 'z', expires_at: 'z' },
        { id: 'i4', from_user: 'fay', name: 'Fay', kind: 'group', group_id: 'g', group_name: 'Tuesday crew', at: 'z', expires_at: 'z' },
      ],
    })
    expect(now?.friends).toHaveLength(1)
    expect(now?.friends[0]).not.toHaveProperty('xp')
    expect(now?.friends[0]).toMatchObject({ name: 'Fay', online: true, planked_today: true, clean_today: false })
    expect(now?.requests_in).toEqual([{ user_id: 'gus', name: 'Gus', avatar_url: null, at: 'y' }])
    expect(now?.requests_out).toEqual([])
    expect(now?.invites.map((i) => i.id)).toEqual(['i1', 'i4'])
    expect(readFriendsNow(null)).toBeNull()
    expect(readFriendsNow({ code: 'K7QM3XPD' })).toBeNull()
    // No name yet: no code to share.
    expect(readFriendsNow({ code: null, friends: [] })?.code).toBeNull()
  })
})

describe('the friends list', () => {
  it('puts planking now first, then online, then most recently seen, then those who hide it', () => {
    const order = friendsInOrder([
      friend('Hidden new', { since: '2026-09-30T00:00:00Z' }),
      friend('Seen long ago', { seen_at: minutesAgo(600) }),
      friend('Online', { online: true, seen_at: minutesAgo(1) }),
      friend('Hidden old', { since: '2026-01-01T00:00:00Z' }),
      friend('Planking', { planking: true, online: true, seen_at: minutesAgo(1) }),
      friend('Seen lately', { seen_at: minutesAgo(30) }),
    ])
    expect(order.map((f) => f.name)).toEqual(['Planking', 'Online', 'Seen lately', 'Seen long ago', 'Hidden new', 'Hidden old'])
  })
})

describe('what a friend is doing', () => {
  it('says planking now, today\'s song planked, online, or when they were last seen', () => {
    expect(activityLine(friend('A', { planking: true, planked_today: true, planked_song: 'style' }), NOW)).toBe('Planking now')
    expect(activityLine(friend('A', { online: true, planked_today: true, planked_song: 'style', planked_at: minutesAgo(20) }), NOW)).toBe('Planked Style · 20 min ago')
    expect(activityLine(friend('A', { online: true }), NOW)).toBe('Online')
    expect(activityLine(friend('A', { seen_at: minutesAgo(190) }), NOW)).toBe('Seen 3 hours ago')
    expect(activityLine(friend('A'), NOW)).toBe('Offline')
  })

  it('leaves out when, for a friend who hides it', () => {
    expect(activityLine(friend('A', { planked_today: true, planked_song: 'style' }), NOW)).toBe('Planked Style')
  })

  it('counts time in minutes, hours and days', () => {
    expect(timeAgo(minutesAgo(0.5), NOW)).toBe('just now')
    expect(timeAgo(minutesAgo(59), NOW)).toBe('59 min ago')
    expect(timeAgo(minutesAgo(60), NOW)).toBe('1 hour ago')
    expect(timeAgo(minutesAgo(60 * 24 * 2 + 5), NOW)).toBe('2 days ago')
    expect(timeAgo('not a time', NOW)).toBe('just now')
  })
})

describe("why a friends call didn't work", () => {
  it('reads the database\'s messages', () => {
    expect(friendProblem('no such friend code')).toBe('not-found')
    expect(friendProblem("that's your own code")).toBe('yourself')
    expect(friendProblem('unblock them first')).toBe('blocked')
    expect(friendProblem('too many requests today')).toBe('too-many-today')
    expect(friendProblem('too many requests waiting')).toBe('too-many-waiting')
    expect(friendProblem('a name first')).toBe('name')
    expect(friendProblem('something else')).toBe('unavailable')
    expect(friendProblem(undefined)).toBe('unavailable')
  })
})
