import { describe, expect, it } from 'vitest'
import { hostOf, isFull, joinTime, MAX_MEMBERS, readPresences, roomMembers, sameMembers, withLatestStatus, withRejoining, type Presence } from './members'

const person = (id: string, joinedAt: number, fields: Partial<Presence> = {}): Presence => ({
  id,
  name: id.toUpperCase(),
  status: 'lobby',
  joinedAt,
  round: 0,
  n: 0,
  ...fields,
})

describe("who's in a room", () => {
  it('makes whoever has been there longest the host, the smaller id on a tie', () => {
    expect(hostOf([person('b', 20), person('a', 30), person('c', 10)])).toBe('c')
    expect(hostOf([person('b', 10), person('a', 10)])).toBe('a')
    expect(hostOf([])).toBeNull()
  })

  it('joins after everyone already there, even with a clock running behind', () => {
    expect(joinTime([], 5000)).toBe(5000)
    expect(joinTime([person('a', 1000), person('b', 9000)], 5000)).toBe(9001)
    expect(joinTime([person('a', 1000)], 5000)).toBe(5000)
  })

  it('shows everyone longest in first, names tidied', () => {
    const members = roomMembers([person('b', 20, { name: '  Ben\n\tB ' }), person('a', 10, { name: '' })], 0)
    expect(members).toEqual([
      { id: 'a', name: 'Someone', status: 'lobby', joinedAt: 10 },
      { id: 'b', name: 'Ben B', status: 'lobby', joinedAt: 20 },
    ])
  })

  it("shows a status from an earlier round as waiting for this one", () => {
    const members = roomMembers([person('a', 1, { status: 'done', round: 1 }), person('b', 2, { status: 'planking', round: 2 })], 2)
    expect(members.map((m) => m.status)).toEqual(['lobby', 'planking'])
  })

  it(`shows at most ${MAX_MEMBERS}, and anyone after them finds the room full`, () => {
    const crowd = Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => person(`p${String(i).padStart(2, '0')}`, i))
    expect(roomMembers(crowd, 0)).toHaveLength(MAX_MEMBERS)
    expect(isFull(crowd, 'p19')).toBe(false)
    expect(isFull(crowd, 'p20')).toBe(true)
    // Not in yet: full once MAX_MEMBERS are.
    expect(isFull(crowd.slice(0, MAX_MEMBERS), 'new')).toBe(true)
    expect(isFull(crowd.slice(0, MAX_MEMBERS - 1), 'new')).toBe(false)
  })

  it('reads presence: the latest from each device, and nothing that makes no sense', () => {
    const state = {
      a: [
        { name: 'Ana', status: 'lobby', joinedAt: 1, round: 0, presence_ref: '1' },
        { name: 'Ana', status: 'planking', joinedAt: 1, round: 1, n: 3, presence_ref: '2' },
      ],
      b: [{ name: 'Ben', status: 'dancing', joinedAt: 2, round: 0 }],
      c: [{ name: 'Cleo', status: 'done', joinedAt: 'soon', round: 0 }],
      d: [],
    }
    expect(readPresences(state)).toEqual([{ id: 'a', name: 'Ana', status: 'planking', joinedAt: 1, round: 1, n: 3 }])
    // No count: the first.
    expect(readPresences({ b: [{ name: 'Ben', status: 'lobby', joinedAt: 2, round: 0 }] })[0].n).toBe(0)
  })

  it("takes each device's latest status, from broadcast until presence catches up", () => {
    const presences = [person('a', 1, { status: 'planking', round: 1, n: 2 }), person('b', 2, { status: 'planking', round: 1, n: 4 })]
    const heard = new Map([
      ['a', { status: 'done' as const, round: 1, n: 3 }],
      ['b', { status: 'out' as const, round: 1, n: 3 }],
    ])
    expect(withLatestStatus(presences, heard).map((p) => `${p.id}:${p.status}:${p.n}`)).toEqual(['a:done:3', 'b:planking:4'])
    expect(withLatestStatus(presences, new Map())).toEqual(presences)
  })

  it('keeps someone who dropped out of presence while they speak up, until their presence is back', () => {
    const ana = person('a', 1)
    const ben = person('b', 2, { status: 'planking', round: 1 })
    const known = new Map([
      ['a', ana],
      ['b', ben],
    ])
    // Ben's channel closed: he's out of presence, but said hello 3 seconds ago.
    expect(withRejoining([ana], known, new Map([['b', 7000]]), 10_000, 17_000)).toEqual([ana, ben])
    // Silent too long: gone.
    expect(withRejoining([ana], known, new Map([['b', 7000]]), 30_000, 17_000)).toEqual([ana])
    // Back in presence: listed once.
    expect(withRejoining([ana, ben], known, new Map([['b', 7000]]), 10_000, 17_000)).toEqual([ana, ben])
    // Never seen in presence: nothing to show them by.
    expect(withRejoining([ana], new Map([['a', ana]]), new Map([['c', 9000]]), 10_000, 17_000)).toEqual([ana])
  })

  it('tells when nothing shown has changed', () => {
    const now = roomMembers([person('a', 1)], 0)
    expect(sameMembers(now, roomMembers([person('a', 1)], 0))).toBe(true)
    expect(sameMembers(now, roomMembers([person('a', 1, { status: 'planking' })], 0))).toBe(false)
    expect(sameMembers(now, [])).toBe(false)
  })
})
