import { describe, expect, it } from 'vitest'
import { LADDER } from '../data/songs'
import type { Completion } from './progress'
import { playerRank } from './ranks'

const at = (i: number) => new Date(Date.UTC(2026, 8, 22, 12, 0, i)).toISOString()

/** A daily plank carrying `xp`, so XP can be set without climbing. */
const xp = (amount: number): Completion => ({ day: '2026-09-22', mode: 'daily', songId: 'cancelled', seconds: 211, at: at(0), xp: amount })

/** Ladder levels 1 to `n`, each with or without breaks. */
const climbed = (n: number, breaks = false): Completion[] =>
  LADDER.slice(0, n).map((song, i) => ({
    day: '2026-09-22',
    mode: 'ladder',
    songId: song.id,
    level: i + 1,
    seconds: song.seconds,
    at: at(i + 1),
    ...(breaks ? { pauses: [{ at: 30, ms: 2_000 }] } : {}),
  }))

const name = (completions: Completion[]) => {
  const rank = playerRank(completions)
  return rank.division ? `${rank.tier.name} ${rank.division}` : rank.tier.name
}

describe('ranks', () => {
  it('starts everyone at Scribble IV and moves through the divisions on XP', () => {
    expect(name([])).toBe('Scribble IV')
    expect(name([xp(500)])).toBe('Scribble III')
    expect(playerRank([xp(500)]).nextStep).toBe('1,000 XP to Scribble II.')
  })

  it('needs the ladder level before a new tier, however much XP there is', () => {
    expect(name([xp(60_000)])).toBe('Scribble I')
    expect(playerRank([xp(60_000)]).nextStep).toBe('Climb to level 10 for Couplet IV.')
    expect(name([xp(60_000), ...climbed(10)])).toBe('Couplet I')
    expect(name([xp(4_000), ...climbed(10)])).toBe('Scribble I')
    expect(playerRank([xp(4_000), ...climbed(10)]).nextStep).toBe('1,000 XP to Couplet IV.')
  })

  it('asks for both when both are missing', () => {
    expect(playerRank([xp(3_000)]).nextStep).toBe('2,000 XP and ladder level 10 for Couplet IV.')
  })

  it('keeps the top three for finishing the ladder, then for holding every level straight through', () => {
    const lots = xp(300_000)
    expect(name([lots, ...climbed(200)])).toBe('Anthology I')
    expect(playerRank([lots, ...climbed(200)]).nextStep).toBe('Climb every level for Manuscript.')
    expect(name([lots, ...climbed(LADDER.length, true)])).toBe('Manuscript')
    expect(playerRank([lots, ...climbed(LADDER.length, true)]).nextStep).toBe('Hold every level with no breaks for Masterpiece.')
    const top = playerRank([lots, ...climbed(LADDER.length)])
    expect(name([lots, ...climbed(LADDER.length)])).toBe('Magnum Opus')
    expect(top).toMatchObject({ step: 31, next: null, nextStep: 'The top rank.' })
  })

  it('stops at Masterpiece until the XP for Magnum Opus is there', () => {
    expect(name([xp(220_000), ...climbed(LADDER.length)])).toBe('Masterpiece')
    expect(playerRank([xp(220_000), ...climbed(LADDER.length)]).nextStep).toBe('12,500 XP to Magnum Opus.')
  })
})
