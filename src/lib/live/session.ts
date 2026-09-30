import { ALBUMS, LADDER, type Song } from '../../data/songs'
import type { PlankSession } from '../../components/PlankTimer'
import type { DayKey } from '../dates'
import { dailyView, ladderView, type AppData } from '../progress'

const LABEL = 'Planking together'

/**
 * What a room's song counts as for this person, the way it would planked alone: today's song, their
 * ladder level, practice on a level they've climbed, or a new release.
 */
export function togetherSession(song: Song, data: AppData, today: DayKey): PlankSession {
  const daily = dailyView(data, today)
  const ladder = ladderView(data, today)
  if (daily.song.id === song.id && !daily.done) return { song, label: LABEL, kind: 'daily' }
  if (ladder.song?.id === song.id) return { song, label: LABEL, kind: 'ladder', level: ladder.level }
  if (daily.song.id === song.id) return { song, label: LABEL, kind: 'extra' }
  if (ALBUMS[song.album].afterLaunch) return { song, label: LABEL, kind: 'era' }
  const level = LADDER.findIndex((s) => s.id === song.id) + 1
  return { song, label: LABEL, kind: 'practice', ...(level > 0 ? { level } : {}) }
}
