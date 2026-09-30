import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SONG_BY_ID } from '../../data/songs'
import type { TogetherShare } from './link'
import { cleanName } from './name'
import { namesList, togetherAlt, togetherText } from './togetherShare'

// Cruel Summer, 2:59. 29 September 2026 is daily #8.
const song = SONG_BY_ID.get('cruel-summer')!
const NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lou']
const room = (count: number, pauses: TogetherShare['pauses'] = []): TogetherShare => ({
  song,
  day: '2026-09-29',
  finishers: NAMES.slice(0, count),
  pauses,
})
const TWO_BREAKS = [
  { at: 62, ms: 9000 },
  { at: 140, ms: 70_000 },
]

beforeEach(() => vi.stubGlobal('window', { location: { origin: 'https://planktotaylor.com' } }))
afterEach(() => vi.unstubAllGlobals())

describe("the room's share as text", () => {
  it('names the three who held to the end, with the bar and the link', () => {
    expect(togetherText(room(3))).toBe(
      [
        'Plank to Taylor #8 · Planked together',
        'Cruel Summer · 3 people',
        '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩',
        '2:59 plank, no breaks',
        'Ana, Ben and Cleo',
        'Plank along: https://planktotaylor.com/',
      ].join('\n'),
    )
  })

  it("shows the room's breaks, without saying whose they were", () => {
    expect(togetherText(room(2, TWO_BREAKS))).toBe(
      [
        'Plank to Taylor #8 · Planked together',
        'Cruel Summer · 2 people',
        '🟩🟩🟩🟩🟧🟩🟩🟩🟩🟧🟩🟩',
        '2:59 plank · 2 pauses, 1:19 · 4:18 total',
        'Ana and Ben',
        'Plank along: https://planktotaylor.com/',
      ].join('\n'),
    )
  })

  it('says "planked it" for one, never "1 of us"', () => {
    expect(togetherText(room(1, TWO_BREAKS)).split('\n').slice(0, 2)).toEqual(['Plank to Taylor #8 · Planked it', 'Cruel Summer'])
    expect(togetherText(room(1)).split('\n')[4]).toBe('Ana')
  })

  it('names nine as the first three and how many more', () => {
    const lines = togetherText(room(9, TWO_BREAKS)).split('\n')
    expect(lines[1]).toBe('Cruel Summer · 9 people')
    expect(lines[4]).toBe('Ana, Ben, Cleo and 6 more')
  })

  it('names twelve the same way', () => {
    const lines = togetherText(room(12)).split('\n')
    expect(lines[1]).toBe('Cruel Summer · 12 people')
    expect(lines[4]).toBe('Ana, Ben, Cleo and 9 more')
  })

  it('leaves out the names when nobody held to the end', () => {
    expect(togetherText(room(0))).not.toMatch(/people|\n\n/)
  })
})

describe('the names', () => {
  it('lists up to eight in full', () => {
    expect(namesList(NAMES.slice(0, 8))).toBe('Ana, Ben, Cleo, Dev, Eli, Fay, Gus and Hal')
  })

  it('keeps each name on one line, trimmed and cut to 24 characters', () => {
    expect(cleanName('  Ana  ')).toBe('Ana')
    expect(cleanName('Ana\nBen\tCleo')).toBe('Ana Ben Cleo')
    expect(cleanName('\u202eAna')).toBe('Ana')
    expect(cleanName('Anastasia Beverly Hills-Smith')).toBe('Anastasia Beverly Hills…')
    expect(Array.from(cleanName('💪'.repeat(30)))).toHaveLength(24)
  })

  it('counts a blank name among the more, without a gap for it', () => {
    expect(namesList(['Ana', '   ', 'Cleo'])).toBe('Ana, Cleo and 1 more')
  })
})

describe("the card's alt text", () => {
  it('says the song, who planked it and how it went', () => {
    expect(togetherAlt(room(3, TWO_BREAKS))).toBe('Cruel Summer, planked together by Ana, Ben and Cleo: 2:59 plank · 2 pauses, 1:19 · 4:18 total.')
    expect(togetherAlt(room(1))).toBe('Cruel Summer, planked by Ana: 2:59 plank, no breaks.')
  })
})
