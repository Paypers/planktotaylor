import { describe, expect, it } from 'vitest'
import type { LiveMember } from './link'
import { addFinishers, byJoined } from './strip'

const member = (id: string, joinedAt: number, status: LiveMember['status'] = 'planking'): LiveMember => ({ id, name: id, status, joinedAt })

describe("who's here", () => {
  it('lists the longest in the room first', () => {
    const members = [member('cleo', 30), member('ana', 10), member('ben', 20)]
    expect(byJoined(members).map((m) => m.id)).toEqual(['ana', 'ben', 'cleo'])
    // Leaves the room's own list alone.
    expect(members[0].id).toBe('cleo')
  })

  it('adds whoever has finished, in the same order', () => {
    const first = addFinishers([], [member('ben', 20, 'done'), member('ana', 10, 'planking'), member('cleo', 30, 'out')])
    expect(first.map((m) => m.id)).toEqual(['ben'])
    const next = addFinishers(first, [member('ben', 20, 'done'), member('ana', 10, 'done')])
    expect(next.map((m) => m.id)).toEqual(['ana', 'ben'])
  })

  it('keeps someone who finished and then left the room', () => {
    const finishers = addFinishers([], [member('ana', 10, 'done'), member('ben', 20, 'done')])
    expect(addFinishers(finishers, [member('ben', 20, 'done')]).map((m) => m.id)).toEqual(['ana', 'ben'])
  })

  it('gives the same list back when nobody new has finished', () => {
    const finishers = addFinishers([], [member('ana', 10, 'done')])
    expect(addFinishers(finishers, [member('ana', 10, 'done'), member('ben', 20, 'planking')])).toBe(finishers)
  })
})
