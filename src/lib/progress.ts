import { LADDER, SONG_BY_ID, type Song } from '../data/songs'
import { dailyNumber, dailySong } from './daily'
import type { DayKey } from './dates'
import { plankXp } from './xp'

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
  /**
   * XP earned, only when signed in. A plank that counts twice (today's song and a ladder level)
   * carries its XP on the first record only.
   */
  xp?: number
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

/** One daily plank a day, and one plank of each ladder song a day. */
export const completionKey = (c: Pick<Completion, 'day' | 'mode' | 'songId'>) => `${c.day}|${c.mode}|${c.songId}`

/** Days you planked today's song: the streak. Ladder levels don't count towards it. */
export function streakDays(completions: readonly Completion[]): Set<DayKey> {
  return new Set(completions.filter((c) => c.mode === 'daily').map((c) => c.day))
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
  /** Ladder levels climbed today, in order. There's no limit: climb as many as you like. */
  climbedToday: Completion[]
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
    climbedToday: data.completions.filter((c) => c.mode === 'ladder' && c.day === today).sort((a, b) => a.at.localeCompare(b.at)),
    finished: level > total,
  }
}

/**
 * What finishing a plank of `song` today counts for: today's song (once a day), the next ladder
 * level (as many a day as you like), or both at once when they're the same song.
 * `earnXp` is for signed-in players; the XP goes on the first record so a two-for-one isn't paid twice.
 */
export function applyPlank(
  data: AppData,
  song: Song,
  today: DayKey,
  at: string,
  pauses: Pause[] = [],
  earnXp = false,
): { data: AppData; added: Completion[] } {
  const added: Completion[] = []
  const daily = dailyView(data, today)
  const ladder = ladderView(data, today)
  const extra = pauses.length > 0 ? { pauses } : {}
  let cursor = data.ladder

  if (daily.song.id === song.id && !daily.done) {
    added.push({ day: today, mode: 'daily', songId: song.id, seconds: song.seconds, at, ...extra })
  }
  // The same song twice in a day (after moving back down the ladder) only counts once.
  const againToday = ladder.climbedToday.some((c) => c.songId === song.id)
  if (ladder.song?.id === song.id && !againToday) {
    added.push({ day: today, mode: 'ladder', songId: song.id, level: ladder.level, seconds: song.seconds, at, ...extra })
    cursor = { level: ladder.level + 1, updatedAt: at }
  }
  if (added.length === 0) return { data, added }
  if (earnXp) added[0] = { ...added[0], xp: plankXp(song.seconds, pauses).total }
  return { data: { ...data, completions: [...data.completions, ...added], ladder: cursor }, added }
}

/**
 * Union of two histories. When both have the same plank, the earlier one wins, keeping any XP
 * the other copy has (XP can be granted on the account after the browser recorded the plank).
 */
export function mergeCompletions(a: readonly Completion[], b: readonly Completion[]): Completion[] {
  const byKey = new Map<string, Completion>()
  for (const c of [...a, ...b]) {
    const existing = byKey.get(completionKey(c))
    if (!existing) byKey.set(completionKey(c), c)
    else {
      const winner = c.at < existing.at ? c : existing
      const xp = Math.max(existing.xp ?? 0, c.xp ?? 0)
      byKey.set(completionKey(c), xp > 0 ? { ...winner, xp } : winner)
    }
  }
  return [...byKey.values()].sort((x, y) => x.day.localeCompare(y.day) || x.at.localeCompare(y.at) || x.mode.localeCompare(y.mode))
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
