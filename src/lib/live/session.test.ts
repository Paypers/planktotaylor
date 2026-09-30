import { describe, expect, it } from 'vitest'
import { LADDER, SONG_BY_ID } from '../../data/songs'
import { dailySong } from '../daily'
import { emptyData, type AppData, type Completion } from '../progress'
import { togetherSession } from './session'

const today = '2026-09-29'
const daily = dailySong(today)
const levelOf = (id: string) => LADDER.findIndex((s) => s.id === id) + 1

const planked = (songId: string, mode: Completion['mode'], day = today): Completion => ({
  day,
  mode,
  songId,
  seconds: SONG_BY_ID.get(songId)!.seconds,
  at: `${day}T08:00:00.000Z`,
})
const withData = (completions: Completion[], level = 1): AppData => ({
  ...emptyData(),
  completions,
  ladder: { level, updatedAt: `${today}T08:00:00.000Z` },
})

describe('what planking together counts as, for each person', () => {
  it("is today's song until it's done, then extra credit", () => {
    expect(togetherSession(daily, withData([]), today)).toEqual({ song: daily, label: 'Planking together', kind: 'daily' })
    expect(togetherSession(daily, withData([planked(daily.id, 'daily')]), today).kind).toBe('extra')
  })

  it("is today's song when it's their ladder level too, and the level once today's is done", () => {
    const level = levelOf(daily.id)
    expect(togetherSession(daily, withData([], level), today).kind).toBe('daily')
    expect(togetherSession(daily, withData([planked(daily.id, 'daily')], level), today)).toMatchObject({ kind: 'ladder', level })
  })

  it('climbs their ladder level', () => {
    const song = LADDER[0].id === daily.id ? LADDER[1] : LADDER[0]
    const level = levelOf(song.id)
    expect(togetherSession(song, withData([], level), today)).toEqual({ song, label: 'Planking together', kind: 'ladder', level })
  })

  it("is practice on a level they've climbed, or one they haven't reached", () => {
    const climbed = LADDER.find((s) => s.id !== daily.id)!
    const data = withData([planked(climbed.id, 'ladder', '2026-09-01')], 50)
    expect(togetherSession(climbed, data, today)).toMatchObject({ kind: 'practice', level: levelOf(climbed.id) })
    const ahead = LADDER[199]
    expect(togetherSession(ahead, data, today)).toMatchObject({ kind: 'practice', level: 200 })
  })

  it('collects a new release', () => {
    const release = SONG_BY_ID.get('patient-zero')!
    expect(release.id).not.toBe(daily.id)
    expect(togetherSession(release, withData([]), today)).toEqual({ song: release, label: 'Planking together', kind: 'era' })
  })
})
