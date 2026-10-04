import { describe, expect, it } from 'vitest'
import { LONGEST_PLANK_MS, PLANKING_GRACE_MS, nextExpiry, plankersIn, plankingNowLine, plankingUntil } from './presence'

const NOW = 1_800_000_000_000

describe('planking now in a group', () => {
  it('counts each member planking, once however many devices, and never yourself', () => {
    const state = {
      ana: [{ until: NOW + 60_000 }],
      ben: [{ until: NOW + 60_000 }, { until: NOW + 90_000 }],
      me: [{ until: NOW + 60_000 }],
    }
    expect(plankersIn(state, 'me', NOW)).toEqual(new Set(['ana', 'ben']))
  })

  it("drops a plank that's gone stale, or says something unbelievable", () => {
    const state = {
      stale: [{ until: NOW - 1 }],
      forever: [{ until: NOW + LONGEST_PLANK_MS + 1 }],
      junk: [{ until: 'soon' }, null, {}],
      fine: [{ until: NOW - 1 }, { until: NOW + 1000 }],
    }
    expect(plankersIn(state, null, NOW)).toEqual(new Set(['fine']))
  })

  it('says how many, never who', () => {
    expect(plankingNowLine(0)).toBe("Nobody's planking right now")
    expect(plankingNowLine(3)).toBe('3 planking right now')
  })

  it('lasts the song and a few breaks', () => {
    expect(plankingUntil(200, NOW)).toBe(NOW + 200_000 + PLANKING_GRACE_MS)
  })

  it('knows when to count again: when the next plank stops counting', () => {
    expect(nextExpiry({ ana: [{ until: NOW + 5000 }], ben: [{ until: NOW + 2000 }, { until: NOW - 1 }] }, NOW)).toBe(NOW + 2000)
    expect(nextExpiry({ ana: [{ until: NOW - 1 }] }, NOW)).toBeNull()
    expect(nextExpiry({}, NOW)).toBeNull()
  })
})
