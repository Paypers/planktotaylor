import { describe, expect, it } from 'vitest'
import { breakSlots, readStats, SLOTS, togetherTime, toughestStretch, type DailyStats } from './together'

const stats = (planks: number, slices: Record<number, number> = {}): DailyStats => ({
  planks,
  noBreak: 0,
  seconds: 0,
  slices: Array.from({ length: SLOTS }, (_, i) => slices[i] ?? 0),
})

describe('how everyone did today', () => {
  it('puts each break in its 5% of the song', () => {
    // A 200-second song: each slot is 10 seconds.
    expect(breakSlots([{ at: 0, ms: 2000 }, { at: 9.9, ms: 2000 }, { at: 10, ms: 2000 }, { at: 160.4, ms: 2000 }], 200)).toEqual([0, 0, 1, 16])
    // A break right at the end still lands in the last slot.
    expect(breakSlots([{ at: 200, ms: 2000 }], 200)).toEqual([19])
  })

  it('sends at most 20 breaks', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ at: i, ms: 2000 }))
    expect(breakSlots(many, 200)).toHaveLength(20)
  })

  it('finds the toughest stretch once 20 people have planked', () => {
    // 231 seconds (Style): slot 13 runs 150.15 to 161.7, so its middle rounds to 2:40.
    expect(toughestStretch(stats(20, { 2: 3, 13: 9, 17: 4 }), 231)).toBe(160)
    expect(toughestStretch(stats(19, { 13: 9 }), 231)).toBeNull()
  })

  it('has no toughest stretch when nobody took a break, and picks the earlier one on a tie', () => {
    expect(toughestStretch(stats(50), 231)).toBeNull()
    expect(toughestStretch(stats(50, { 4: 5, 12: 5 }), 200)).toBe(50)
  })

  it('tells the time held together in words', () => {
    expect(togetherTime(95_000)).toBe('26 hours')
    expect(togetherTime(3 * 3600 + 20 * 60)).toBe('3 hours 20 minutes')
    expect(togetherTime(3600)).toBe('1 hour')
    expect(togetherTime(3600 + 60)).toBe('1 hour 1 minute')
    expect(togetherTime(45 * 60)).toBe('45 minutes')
    expect(togetherTime(20)).toBe('1 minute')
    expect(togetherTime(4_000_000)).toBe('1,111 hours')
  })

  it('reads a day counted before the stats, and whatever the database sends', () => {
    expect(readStats({ planks: 7 })).toEqual(stats(7))
    expect(readStats(null)).toEqual(stats(0))
    expect(readStats({ planks: 3, no_break: 2, seconds: '693', break_slices: [1, 2] })).toEqual({ ...stats(3), noBreak: 2, seconds: 693 })
  })
})
