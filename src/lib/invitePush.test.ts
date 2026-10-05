import { describe, expect, it } from 'vitest'
import { invitePush } from './invitePush'

const room = { from: 'Ana', kind: 'room' as const, roomCode: 'ab12cd34ef', songId: 'style', groupId: null, groupName: null }
const group = { from: 'Ana', kind: 'group' as const, roomCode: null, songId: null, groupId: 'g1', groupName: 'Gym buddies' }

describe('an invite as a push', () => {
  it('names the friend and the song, and opens the room', () => {
    expect(invitePush(room)).toEqual({
      title: 'Ana invited you to plank',
      body: 'Style (3:51), together, now. Tap to join them.',
      hash: '#together/ab12cd34ef/style',
      tag: 'invite-room',
    })
  })

  it("a group's opens the friends list, where its invite waits", () => {
    expect(invitePush(group)).toEqual({
      title: 'Ana invited you to Gym buddies',
      body: 'Tap to join the group, or say not now, in your friends list.',
      hash: '#friends',
      tag: 'invite-group-g1',
    })
  })

  it('puts a name on one line, cut short', () => {
    expect(invitePush({ ...room, from: '  Ana\n\tLee ' })?.title).toBe('Ana Lee invited you to plank')
    expect(invitePush({ ...room, from: '' })?.title).toBe('A friend invited you to plank')
    expect(invitePush({ ...room, from: 'x'.repeat(60) })?.title.startsWith(`${'x'.repeat(40)} invited`)).toBe(true)
  })

  it('sends nothing for a song or a room that is not one', () => {
    expect(invitePush({ ...room, songId: 'not-a-song' })).toBeNull()
    expect(invitePush({ ...room, roomCode: 'NOT A ROOM' })).toBeNull()
    expect(invitePush({ ...group, groupName: null })).toBeNull()
  })
})
