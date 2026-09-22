import { LADDER, SONG_BY_ID, type Song } from '../data/songs'
import { dailyNumber, dailySong } from './daily'
import type { DayKey } from './dates'

export type Mode = 'daily' | 'ladder'

/** A break during a plank: where in the song it happened and how long it lasted. */
export interface Pause {
  /** Seconds into the song. */
  at: number
  ms: number
}

export interface Completion {
  day: DayKey
  mode: Mode
  songId: string
  /** Ladder level, for ladder completions. */
  level?: number
  seconds: number
  /** ISO timestamp. */
  at: string
  /** Breaks taken along the way; absent for a plank held straight through. */
  pauses?: Pause[]
}

export interface LadderCursor {
  /** The next level to plank (1-based). LADDER.length + 1 means the whole discography is done. */
  level: number
  updatedAt: string
}

export interface Prefs {
  music: boolean
  sounds: boolean
}

export interface AppData {
  v: 1
  completions: Completion[]
  ladder: LadderCursor
  prefs: Prefs
}

export function emptyData(): AppData {
  return {
    v: 1,
    completions: [],
    ladder: { level: 1, updatedAt: new Date(0).toISOString() },
    prefs: { music: true, sounds: true },
  }
}

export const completionKey = (c: Pick<Completion, 'day' | 'mode'>) => `${c.day}|${c.mode}`

export function plankedDays(completions: readonly Completion[]): Set<DayKey> {
  return new Set(completions.map((c) => c.day))
}

export interface DailyView {
  number: number
  song: Song
  done: boolean
}

export function dailyView(data: AppData, today: DayKey): DailyView {
  return {
    number: dailyNumber(today),
    song: dailySong(today),
    done: data.completions.some((c) => c.mode === 'daily' && c.day === today),
  }
}

export interface LadderView {
  total: number
  /** The level that is up next. */
  level: number
  song: Song | null
  /** Today's ladder plank, if it's already done. */
  doneToday: Completion | null
  /** Every level has been planked. */
  finished: boolean
}

export function ladderView(data: AppData, today: DayKey): LadderView {
  const total = LADDER.length
  const level = Math.min(Math.max(1, data.ladder.level), total + 1)
  return {
    total,
    level,
    song: LADDER[level - 1] ?? null,
    doneToday: data.completions.find((c) => c.mode === 'ladder' && c.day === today) ?? null,
    finished: level > total,
  }
}

/**
 * What finishing a plank of `song` today counts for. One plank can count twice when
 * today's global song happens to be your ladder level too.
 */
export function applyPlank(
  data: AppData,
  song: Song,
  today: DayKey,
  at: string,
  pauses: Pause[] = [],
): { data: AppData; added: Completion[] } {
  const added: Completion[] = []
  const daily = dailyView(data, today)
  const ladder = ladderView(data, today)
  const extra = pauses.length > 0 ? { pauses } : {}
  let cursor = data.ladder

  if (daily.song.id === song.id && !daily.done) {
    added.push({ day: today, mode: 'daily', songId: song.id, seconds: song.seconds, at, ...extra })
  }
  if (ladder.song?.id === song.id && !ladder.doneToday) {
    added.push({ day: today, mode: 'ladder', songId: song.id, level: ladder.level, seconds: song.seconds, at, ...extra })
    cursor = { level: ladder.level + 1, updatedAt: at }
  }
  if (added.length === 0) return { data, added }
  return { data: { ...data, completions: [...data.completions, ...added], ladder: cursor }, added }
}

/** Union of two histories; when both have the same day+mode, the earlier plank wins. */
export function mergeCompletions(a: readonly Completion[], b: readonly Completion[]): Completion[] {
  const byKey = new Map<string, Completion>()
  for (const c of [...a, ...b]) {
    const existing = byKey.get(completionKey(c))
    if (!existing || c.at < existing.at) byKey.set(completionKey(c), c)
  }
  return [...byKey.values()].sort((x, y) => x.day.localeCompare(y.day) || x.mode.localeCompare(y.mode))
}

export function newerCursor(a: LadderCursor, b: LadderCursor): LadderCursor {
  return b.updatedAt > a.updatedAt ? b : a
}

export function songFor(c: Completion): Song | undefined {
  return SONG_BY_ID.get(c.songId)
}

export function totalSeconds(completions: readonly Completion[]): number {
  return completions.reduce((sum, c) => sum + c.seconds, 0)
}
