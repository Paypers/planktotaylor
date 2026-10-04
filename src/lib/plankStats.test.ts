import { describe, expect, it } from 'vitest'
import { SONG_BY_ID } from '../data/songs'
import type { Attempt, AttemptOutcome } from './attempts'
import { plankStats, timePlankedLine, unbrokenSeconds } from './plankStats'

let n = 0
const go = (songId: string, outcome: AttemptOutcome, reached: number, breaks: { at: number; ms: number }[] = []): Attempt => {
  n += 1
  const at = new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString()
  return {
    id: `a${n}`,
    songId,
    kind: 'daily',
    startedAt: at,
    endedAt: at,
    reached,
    pauses: breaks.length,
    outcome,
    ...(breaks.length ? { breaks } : {}),
  }
}
const length = (id: string) => SONG_BY_ID.get(id)!.seconds

describe('profile stats', () => {
  it('starts empty', () => {
    expect(plankStats([])).toEqual({
      timePlanked: 0,
      finished: 0,
      noBreaks: 0,
      longest: null,
      shortest: null,
      longestUnbroken: null,
      mostPlanked: null,
    })
  })

  it('counts every second, and only planks held to the end as finished', () => {
    const stats = plankStats([
      go('wood', 'finished', length('wood')),
      go('dear-john', 'gave-up', 100),
      go('style', 'finished', length('style'), [{ at: 50, ms: 4000 }]),
    ])
    expect(stats.timePlanked).toBe(length('wood') + 100 + length('style'))
    expect(stats.finished).toBe(2)
    expect(stats.noBreaks).toBe(1)
  })

  it('finds the longest and shortest songs held to the end, never one that ended early', () => {
    const stats = plankStats([
      go('style', 'finished', length('style')),
      go('all-too-well-10-minute-version', 'stopped', 300),
      go('wood', 'finished', length('wood')),
      go('dear-john', 'finished', length('dear-john'), [{ at: 120, ms: 5000 }]),
    ])
    expect(stats.longest?.id).toBe('dear-john')
    expect(stats.shortest?.id).toBe('wood')
  })

  it('finds the longest stretch without a break, on any go', () => {
    expect(unbrokenSeconds(go('dear-john', 'finished', 406, [{ at: 100, ms: 3000 }, { at: 150, ms: 3000 }]))).toBe(256)
    expect(unbrokenSeconds(go('wood', 'gave-up', 80))).toBe(80)
    // Breaks counted before they were timed: there's no telling.
    expect(unbrokenSeconds({ ...go('wood', 'finished', 151), pauses: 2 })).toBeNull()
    const stats = plankStats([go('wood', 'finished', length('wood')), go('dear-john', 'gave-up', 200, [{ at: 20, ms: 2000 }])])
    expect(stats.longestUnbroken).toEqual({ song: SONG_BY_ID.get('dear-john'), seconds: 180 })
  })

  it('names the song planked most, once one has been more than once, the latest winning a tie', () => {
    expect(plankStats([go('wood', 'finished', 151), go('style', 'finished', 231)]).mostPlanked).toBeNull()
    const stats = plankStats([
      go('wood', 'finished', 151),
      go('style', 'finished', 231),
      go('wood', 'finished', 151),
      go('style', 'gave-up', 20),
      go('style', 'finished', 231),
    ])
    expect(stats.mostPlanked).toEqual({ song: SONG_BY_ID.get('style'), times: 2 })
  })

  it('says the time planked in words', () => {
    expect(timePlankedLine(42)).toBe('Under a minute')
    expect(timePlankedLine(15_120)).toBe('4 hours 12 minutes')
  })
})
