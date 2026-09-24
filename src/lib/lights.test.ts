import { describe, expect, it } from 'vitest'
import { FIRST_LIGHT_MS, LIGHT_GAP_MS, LIGHT_SHOW_MS, MAX_LIGHTS, QUIET_END_MS, lightTimes, placeLight } from './lights'

/** A repeatable stand-in for Math.random. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

describe('aurora lights', () => {
  it('start 30 seconds in, then come every 40 to 70 seconds', () => {
    const times = lightTimes(600_000, seeded(7))
    expect(times[0]).toBe(FIRST_LIGHT_MS)
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1]
      expect(gap).toBeGreaterThanOrEqual(LIGHT_GAP_MS.min - 1)
      expect(gap).toBeLessThanOrEqual(LIGHT_GAP_MS.max + 1)
    }
  })

  it('leave the last ten seconds alone, and never go past 12', () => {
    for (let seed = 1; seed < 50; seed++) {
      const times = lightTimes(613_000, seeded(seed))
      expect(times.length).toBeLessThanOrEqual(MAX_LIGHTS)
      expect(times.at(-1)! + LIGHT_SHOW_MS).toBeLessThanOrEqual(613_000 - QUIET_END_MS)
    }
  })

  it('come about 3 times in a 3½-minute song and 11 or 12 in the longest', () => {
    const middle = () => 0.5
    expect(lightTimes(210_000, middle)).toHaveLength(3)
    expect(lightTimes(613_000, middle)).toHaveLength(11)
    expect(lightTimes(613_000, () => 0).length).toBe(12)
    // Level 1 (2:11): room for two.
    expect(lightTimes(131_000, middle)).toHaveLength(2)
  })

  it('find a spot clear of the video, the buttons and the timer', () => {
    const area = { left: 0, top: 0, right: 400, bottom: 800 }
    const avoid = [
      { left: 0, top: 150, right: 400, bottom: 350 }, // timer
      { left: 0, top: 500, right: 400, bottom: 800 }, // video and buttons
    ]
    for (let seed = 1; seed < 40; seed++) {
      const spot = placeLight(area, avoid, 72, 16, seeded(seed))!
      expect(spot).not.toBeNull()
      const clearOf = (b: (typeof avoid)[number]) => spot.x + 72 + 16 <= b.left || spot.x >= b.right + 16 || spot.y + 72 + 16 <= b.top || spot.y >= b.bottom + 16
      expect(avoid.every(clearOf)).toBe(true)
    }
  })

  it('skip a light when there is no room for it', () => {
    expect(placeLight({ left: 0, top: 0, right: 400, bottom: 800 }, [{ left: 0, top: 0, right: 400, bottom: 800 }])).toBeNull()
    expect(placeLight({ left: 0, top: 0, right: 50, bottom: 50 }, [])).toBeNull()
  })
})
