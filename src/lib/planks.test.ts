import { describe, expect, it } from 'vitest'
import { SONGS, type AlbumId, type Song } from '../data/songs'
import type { Attempt } from './attempts'
import { allPlanks, splitByAlbum, splitByKind } from './planks'
import type { Completion } from './progress'

const song = (title: string): Song => SONGS.find((s) => s.title === title)!
const style = song('Style')
const atw = song('All Too Well (10 Minute Version)')
const record = (at: string, s: Song, mode: 'daily' | 'ladder' = 'daily', extra: Partial<Completion> = {}): Completion => ({
  day: at.slice(0, 10),
  mode,
  songId: s.id,
  seconds: s.seconds,
  at,
  ...extra,
})
const go = (endedAt: string, s: Song, kind: Attempt['kind'], outcome: Attempt['outcome'] = 'finished', pauses = 0): Attempt => ({
  id: endedAt,
  songId: s.id,
  kind,
  startedAt: endedAt,
  endedAt,
  reached: s.seconds,
  pauses,
  outcome,
})

describe('every plank', () => {
  it("counts a two-for-one once, as today's song", () => {
    const twoForOne = [record('2026-10-01T09:00:00.000Z', style), record('2026-10-01T09:00:00.000Z', style, 'ladder', { level: 90 })]
    expect(allPlanks(twoForOne, [])).toMatchObject([{ kind: 'daily', seconds: style.seconds }])
  })

  it('counts goes again from the attempt history, but not ones that counted for something, or ones not finished', () => {
    const planks = allPlanks(
      [record('2026-10-01T09:00:00.000Z', style)],
      [
        go('2026-10-01T09:00:00.000Z', style, 'daily'), // the record above
        go('2026-10-01T10:00:00.000Z', style, 'extra'),
        go('2026-10-02T10:00:00.000Z', atw, 'practice', 'finished', 2),
        go('2026-10-02T11:00:00.000Z', atw, 'practice', 'gave-up'),
        // Extra credit that also climbed a ladder level: the record has it.
        go('2026-10-03T09:00:04.000Z', atw, 'extra'),
      ],
    )
    const withLadder = allPlanks(
      [record('2026-10-01T09:00:00.000Z', style), record('2026-10-03T09:00:00.000Z', atw, 'ladder', { level: 243 })],
      [go('2026-10-01T10:00:00.000Z', style, 'extra'), go('2026-10-03T09:00:04.000Z', atw, 'extra')],
    )
    expect(planks.map((p) => p.kind)).toEqual(['daily', 'again', 'again', 'again'])
    expect(planks[2]).toMatchObject({ song: atw, clean: false })
    expect(withLadder.map((p) => p.kind)).toEqual(['daily', 'again', 'ladder'])
  })

  it('splits the time by what it was for, in a fixed order', () => {
    const planks = allPlanks(
      [record('2026-10-01T09:00:00.000Z', style), record('2026-10-02T09:00:00.000Z', atw, 'ladder', { level: 243 })],
      [go('2026-10-01T10:00:00.000Z', style, 'extra'), go('2026-10-01T11:00:00.000Z', style, 'extra')],
    )
    expect(splitByKind(planks)).toEqual([
      { key: 'daily', label: "Today's song", planks: 1, seconds: style.seconds, color: 'var(--chart-daily)' },
      { key: 'ladder', label: 'Ladder', planks: 1, seconds: atw.seconds, color: 'var(--chart-ladder)' },
      { key: 'again', label: 'Planked again', planks: 2, seconds: 2 * style.seconds, color: 'var(--chart-again)' },
    ])
    expect(splitByKind(planks.filter((p) => p.kind !== 'ladder')).map((s) => s.key)).toEqual(['daily', 'again'])
  })

  it('splits the time by album, most first, folding the rest into Other', () => {
    const albums: AlbumId[] = ['debut', 'fearless', 'speaknow', 'red', '1989', 'reputation', 'lover']
    const planks = allPlanks(
      albums.flatMap((album, i) => {
        const s = SONGS.find((x) => x.album === album)!
        // More planks for the later albums, so they come first.
        return Array.from({ length: i + 1 }, (_, n) => record(`2026-10-${String(n + 1).padStart(2, '0')}T0${i}:00:00.000Z`, s))
      }),
      [],
    )
    const slices = splitByAlbum(planks)
    expect(slices).toHaveLength(5)
    // The four with the most time, most first.
    const byTime = albums
      .map((album) => ({ album, seconds: planks.filter((p) => p.song.album === album).reduce((n, p) => n + p.seconds, 0) }))
      .sort((a, b) => b.seconds - a.seconds)
    expect(slices.slice(0, 4).map((s) => s.key)).toEqual(byTime.slice(0, 4).map((a) => a.album))
    expect(slices[4].seconds).toBe(byTime.slice(4).reduce((n, a) => n + a.seconds, 0))
    expect(slices[4]).toMatchObject({ key: 'other', label: '3 more albums' })
    expect(slices.reduce((n, s) => n + s.planks, 0)).toBe(planks.length)
    // Five albums or fewer: no Other.
    expect(splitByAlbum(planks.filter((p) => p.song.album !== 'debut' && p.song.album !== 'fearless')).map((s) => s.key)).not.toContain(
      'other',
    )
  })
})
