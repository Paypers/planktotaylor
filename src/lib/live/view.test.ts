import { describe, expect, it } from 'vitest'
import { findSongs } from './songSearch'
import type { LiveMember, LiveStatus } from './link'
import { heldThisRound, roomProgress, roomView, roundTotal, timeThisRound } from './view'

describe("the room's page", () => {
  it('shows the lobby, then the round from outside, then how it went', () => {
    expect(roomView('lobby', 'lobby')).toBe('lobby')
    expect(roomView('running', 'lobby')).toBe('watching')
    expect(roomView('paused', 'out')).toBe('watching')
    expect(roomView('running', 'done')).toBe('results')
    expect(roomView('over', 'out')).toBe('results')
    expect(roomView('over', undefined)).toBe('results')
  })

  it('keeps everyone who held to the end, even after they leave, and starts each round afresh', () => {
    const person = (id: string, status: LiveStatus, joinedAt: number): LiveMember => ({ id, name: id, status, joinedAt })
    const first = heldThisRound({ round: 0, members: [] }, 1, [person('b', 'done', 2), person('a', 'planking', 1), person('c', 'out', 3)])
    expect(first.members.map((m) => m.id)).toEqual(['b'])
    const later = heldThisRound(first, 1, [person('a', 'done', 1)])
    expect(later.members.map((m) => m.id)).toEqual(['a', 'b'])
    expect(heldThisRound(later, 1, [person('a', 'done', 1)])).toBe(later)
    expect(heldThisRound(later, 2, [person('a', 'lobby', 1)])).toEqual({ round: 2, members: [] })
  })
})

describe("the round's time together", () => {
  const person = (id: string, status: LiveStatus, held?: number): LiveMember => ({ id, name: id, status, joinedAt: 1, ...(held === undefined ? {} : { held }) })

  it('adds up everyone who finished or stepped out, keeping those who leave, and starts each round afresh', () => {
    const first = timeThisRound({ round: 0, seconds: new Map() }, 1, [person('a', 'done', 200), person('b', 'planking'), person('c', 'out', 61)])
    expect(roundTotal(first)).toBe('4:21')
    // c has left the room; b finishes.
    const later = timeThisRound(first, 1, [person('a', 'done', 200), person('b', 'done', 200)])
    expect(roundTotal(later)).toBe('7:41')
    expect(timeThisRound(later, 1, [person('a', 'done', 200)])).toBe(later)
    expect(roundTotal(timeThisRound(later, 2, [person('a', 'lobby')]))).toBe('0:00')
  })

  it('says a long total in hours', () => {
    const many = timeThisRound({ round: 0, seconds: new Map() }, 1, Array.from({ length: 20 }, (_, i) => person(`p${i}`, 'done', 613)))
    expect(roundTotal(many)).toBe('3 hours 24 minutes')
  })
})

describe('where the room is, for someone watching', () => {
  it('counts through the song, and says when it has paused or is counting in', () => {
    expect(roomProgress('running', 72.9, 179)).toBe('1:12 of 2:59')
    expect(roomProgress('paused', 72.9, 179)).toBe('Paused at 1:12 of 2:59')
    expect(roomProgress('countdown', 0, 179)).toBe('Starting: 3, 2, 1…')
    expect(roomProgress('countdown', 72.9, 179)).toBe('Carrying on from 1:12 of 2:59')
    expect(roomProgress('stretch', 0, 179, 41.2)).toBe('Stretching first: the 3-2-1 in 0:42')
  })
})

describe('choosing the song for a room', () => {
  it('finds songs by title first, then by album, up to 8', () => {
    expect(findSongs('')).toEqual([])
    expect(findSongs('cruel summer').map((s) => s.id)).toEqual(['cruel-summer'])
    const love = findSongs('love')
    expect(love).toHaveLength(8)
    expect(love[0].title.toLowerCase()).toContain('love')
    expect(findSongs('folklore', 3).every((s) => s.album === 'folklore')).toBe(true)
  })
})
