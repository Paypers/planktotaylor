import { describe, expect, it } from 'vitest'
import { ALBUMS, LADDER, SONGS, type Song } from '../data/songs'
import type { Attempt, AttemptOutcome } from './attempts'
import type { Completion } from './progress'
import { playerRank } from './ranks'
import {
  albumSeconds,
  ERAS_TOUR_SECONDS,
  reviewSlides,
  reviewText,
  reviewTime,
  reviewYear,
  timeComparison,
  yearInReview,
} from './yearInReview'

const song = (title: string): Song => SONGS.find((s) => s.title === title)!
const atw = song('All Too Well (10 Minute Version)')
const style = song('Style')
let clock = 0
const plank = (day: string, s: Song, extra: Partial<Completion> = {}): Completion => ({
  day,
  mode: 'daily',
  songId: s.id,
  seconds: s.seconds,
  at: `${day}T09:00:${String(clock++ % 60).padStart(2, '0')}.000Z`,
  ...extra,
})
const go = (startedAt: string, s: Song, outcome: AttemptOutcome): Attempt => ({
  id: startedAt,
  songId: s.id,
  kind: 'ladder',
  startedAt,
  endedAt: startedAt,
  reached: 30,
  pauses: 0,
  outcome,
})

describe('your plank year', () => {
  it('opens in December for the year so far, and in January for the year just ended', () => {
    expect(reviewYear('2026-12-01')).toBe(2026)
    expect(reviewYear('2027-01-31')).toBe(2026)
    expect(reviewYear('2026-11-30')).toBeNull()
    expect(reviewYear('2027-02-01')).toBeNull()
  })

  it("covers the site's first day to the end of the year, never past today", () => {
    expect(yearInReview([], [], 2026, '2026-12-05')).toMatchObject({ from: '2026-09-22', to: '2026-12-05' })
    expect(yearInReview([], [], 2026, '2027-01-10')).toMatchObject({ from: '2026-09-22', to: '2026-12-31' })
    expect(yearInReview([], [], 2027, '2027-12-02')).toMatchObject({ from: '2027-01-01', to: '2027-12-02' })
  })

  it("counts each plank once, even one that counted for today's song and a ladder level", () => {
    const twoForOne = plank('2026-10-01', style)
    const completions = [
      twoForOne,
      { ...twoForOne, mode: 'ladder' as const, level: 90 },
      plank('2026-10-02', atw, { pauses: [{ at: 60, ms: 5000 }] }),
    ]
    const review = yearInReview(completions, [], 2026, '2026-12-05')
    expect(review).toMatchObject({ planks: 2, days: 2, seconds: style.seconds + atw.seconds, noBreak: 1, levels: 1 })
    expect(review.longest).toEqual({ song: atw, seconds: atw.seconds })
  })

  it('leaves out planks from other years', () => {
    const completions = [plank('2026-12-30', style), plank('2027-01-02', style)]
    expect(yearInReview(completions, [], 2026, '2027-01-10').planks).toBe(1)
    expect(yearInReview(completions, [], 2027, '2027-12-01').planks).toBe(1)
  })

  it('finds the top album: most planks, then most time', () => {
    const redSong = SONGS.find((s) => s.album === 'red')!
    const review = yearInReview(
      [plank('2026-10-01', style), plank('2026-10-02', redSong), plank('2026-10-03', redSong)],
      [],
      2026,
      '2026-12-05',
    )
    expect(review.topAlbum).toEqual({ album: ALBUMS.red, planks: 2 })
  })

  it('keeps the best streak, freezes included, within the year', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-20']
    expect(
      yearInReview(
        days.map((d) => plank(d, style)),
        [],
        2026,
        '2026-12-05',
      ).bestStreak,
    ).toBe(4)
  })

  it('adds up the lights caught', () => {
    const review = yearInReview(
      [plank('2026-10-01', style, { lights: 3 }), plank('2026-10-02', style, { lights: 2 })],
      [],
      2026,
      '2026-12-05',
    )
    expect(review.lights).toBe(5)
  })

  it('finds the song that fought back: most goes before the first finish, and only once finished', () => {
    const level1 = LADDER[0]
    const attempts = [
      go('2026-10-01T09:00:00.000Z', atw, 'gave-up'),
      go('2026-10-02T09:00:00.000Z', atw, 'stopped'),
      go('2026-10-03T09:00:00.000Z', atw, 'left'),
      go('2026-10-04T09:00:00.000Z', atw, 'finished'),
      go('2026-10-05T09:00:00.000Z', atw, 'gave-up'), // after the finish: doesn't count
      go('2026-10-01T10:00:00.000Z', style, 'gave-up'),
      go('2026-10-02T10:00:00.000Z', style, 'finished'),
      // Lots of goes, never finished: not a win yet.
      ...[1, 2, 3, 4, 5, 6].map((n) => go(`2026-10-0${n}T11:00:00.000Z`, level1, 'gave-up')),
    ]
    expect(yearInReview([], attempts, 2026, '2026-12-05').foughtBack).toEqual({ song: atw, goes: 4 })
    // Finished first time: nothing fought back.
    expect(yearInReview([], [go('2026-10-01T09:00:00.000Z', style, 'finished')], 2026, '2026-12-05').foughtBack).toBeNull()
  })

  it('compares the time planked to something fun', () => {
    expect(timeComparison(3 * ERAS_TOUR_SECONDS, 'midnights', null)).toBe("That's the Eras Tour 3 times over.")
    expect(timeComparison(2.1 * ERAS_TOUR_SECONDS, 'midnights', null)).toBe("That's the Eras Tour twice over.")
    expect(timeComparison(1.1 * ERAS_TOUR_SECONDS, 'midnights', null)).toBe("That's longer than a whole Eras Tour show.")
    const midnights = albumSeconds('midnights')
    expect(timeComparison(midnights * 1.1, 'midnights', null)).toBe("That's all of Midnights, start to finish.")
    expect(timeComparison(Math.min(midnights * 3, ERAS_TOUR_SECONDS - 1), 'midnights', null)).toMatch(
      /^That's all of Midnights, (twice|\d times) over\.$/,
    )
    expect(timeComparison(style.seconds * 4, 'red', style)).toBe("That's Style, 4 times over.")
    expect(timeComparison(style.seconds, 'red', style)).toBe('Every second of it held to the end of the song.')
  })

  it('tells the time in minutes, then hours', () => {
    expect(reviewTime(47 * 60)).toEqual({ big: '47', unit: 'minutes' })
    expect(reviewTime(99 * 60)).toEqual({ big: '99', unit: 'minutes' })
    expect(reviewTime(5.2 * 3600)).toEqual({ big: '5.2', unit: 'hours' })
  })

  it('shows only the slides with something to show, and never a break count', () => {
    expect(reviewSlides(yearInReview([], [], 2026, '2026-12-05'), null)).toEqual([])
    // One plank, with a break: time, planks and the summary.
    const one = yearInReview([plank('2026-10-01', style, { pauses: [{ at: 60, ms: 5000 }] })], [], 2026, '2026-12-05')
    expect(reviewSlides(one, null).map((s) => s.kind)).toEqual(['time', 'planks', 'summary'])

    const completions = [
      plank('2026-10-01', style, { lights: 2 }),
      plank('2026-10-02', atw, { mode: 'ladder', level: 243, pauses: [{ at: 60, ms: 5000 }], xp: 613 }),
    ]
    const attempts = [go('2026-10-01T08:00:00.000Z', style, 'gave-up'), go('2026-10-01T09:00:00.000Z', style, 'finished')]
    const review = yearInReview(completions, attempts, 2026, '2026-12-05')
    const rank = playerRank(completions)
    const slides = reviewSlides(review, rank)
    expect(slides.map((s) => s.kind)).toEqual(['time', 'planks', 'album', 'longest', 'clean', 'fought', 'ladder', 'lights', 'summary'])
    expect(slides.find((s) => s.kind === 'ladder')).toMatchObject({ big: '1', unit: 'level climbed', rank })
    expect(slides.find((s) => s.kind === 'album')?.album).toBeDefined()
    const words = JSON.stringify(slides) + reviewText(review, 'https://example.com')
    expect(words).not.toMatch(/break(?!s 🟩)|pause/i)
  })

  it('leaves the rank off for signed-out players', () => {
    const review = yearInReview([plank('2026-10-02', atw, { mode: 'ladder', level: 243 })], [], 2026, '2026-12-05')
    const ladder = reviewSlides(review, null).find((s) => s.kind === 'ladder')!
    expect(ladder.rank).toBeUndefined()
    expect(ladder.line).toBeUndefined()
  })
})
