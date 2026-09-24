import { LADDER, SONG_BY_ID, type Song } from '../data/songs'
import { dailyNumber, dailySong } from './daily'
import type { DayKey } from './dates'
import { LIGHT_XP, plankXp, totalXp, type XpAward } from './xp'

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
  /** Aurora lights caught, on the same record as the XP. Absent when none were. */
  lights?: number
}

export interface LadderCursor {
  /** The next level to plank (1-based). LADDER.length + 1 means the whole discography is done. */
  level: number
  updatedAt: string
}

export interface Prefs {
  music: boolean
  sounds: boolean
  /** Aurora lights on the plank screen. Settings saved before there were lights don't have it: on. */
  lights: boolean
  /** When they were last changed, on any device. Absent until they are: the account's copy wins. */
  updatedAt?: string
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
    prefs: { music: true, sounds: true, lights: true },
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

export interface PlankResult {
  data: AppData
  /** New records: today's song and/or a ladder level. */
  added: Completion[]
  /** Records a replay improved: breaks cleared and the no-break bonus added. */
  updated: Completion[]
  /** XP this plank actually earned: 0 signed out, and 0 for a replay with nothing left to earn. */
  gained: number
  /** The part of it for aurora lights, or what they would have earned signed out. */
  lightXp: number
  /**
   * new      counted for something (today's song, or a ladder level)
   * upgrade  a replay held straight through after a go with breaks: earns the no-break bonus
   * repeat   a replay that earns nothing
   */
  kind: 'new' | 'upgrade' | 'repeat'
  /** A plank of this song held with no breaks would still earn the no-break bonus. */
  bonusLeft: boolean
}

/**
 * What finishing a plank of `song` today counts for: today's song (once a day), the next ladder
 * level (as many a day as you like), or both at once when they're the same song.
 *
 * XP (`earnXp`: signed in) is paid once per plank: today's song earns it every day; a ladder level
 * earns it the first time it's climbed. Doing either again earns nothing, with one exception: if
 * every earlier go had breaks, holding it straight through earns the no-break bonus, once.
 * A two-for-one carries its XP on the first record only.
 *
 * Aurora lights caught (`lights`) pay LIGHT_XP each, but only where the plank pays in full: today's
 * song, or a ladder level the first time it's climbed. Never on a replay, so nobody can farm them.
 */
export function applyPlank(
  data: AppData,
  song: Song,
  today: DayKey,
  at: string,
  pauses: Pause[] = [],
  earnXp = false,
  lights = 0,
): PlankResult {
  const award = plankXp(song.seconds, pauses)
  const daily = dailyView(data, today)
  const ladder = ladderView(data, today)
  const extra = pauses.length > 0 ? { pauses } : {}
  const added: Completion[] = []

  if (daily.song.id === song.id && !daily.done) {
    added.push({ day: today, mode: 'daily', songId: song.id, seconds: song.seconds, at, ...extra })
  }
  const onLadder = ladder.song?.id === song.id
  if (onLadder && !ladder.climbedToday.some((c) => c.songId === song.id)) {
    added.push({ day: today, mode: 'ladder', songId: song.id, level: ladder.level, seconds: song.seconds, at, ...extra })
  }
  // Planking your ladder level moves you up. Nothing else moves the ladder: it's climbed, not skipped.
  const next = onLadder ? { ...data, ladder: { level: ladder.level + 1, updatedAt: at } } : data

  if (added.length > 0) {
    const left = added.some((c) => c.mode === 'daily')
      ? { xp: award.total, bonusLeft: award.kind === 'held' }
      : ladderXpLeft(data.completions, song.id, award)
    const firstTime = added.some((c) => c.mode === 'daily') || !data.completions.some((c) => c.mode === 'ladder' && c.songId === song.id)
    const lightXp = firstTime ? lights * LIGHT_XP : 0
    const gained = earnXp ? left.xp + lightXp : 0
    added[0] = { ...added[0], ...(gained > 0 ? { xp: gained } : {}), ...(lights > 0 ? { lights } : {}) }
    return {
      data: { ...next, completions: [...data.completions, ...added] },
      added,
      updated: [],
      gained,
      lightXp,
      kind: 'new',
      bonusLeft: left.bonusLeft,
    }
  }

  // A go that counts for nothing new: today's song again, or practice on a ladder level already climbed.
  const target = upgradeTarget(data.completions, song.id, today)
  const gain = target && earnXp && award.kind !== 'held' ? award.total - totalXp(target) : 0
  if (gain <= 0) return { data: next, added: [], updated: [], gained: 0, lightXp: 0, kind: 'repeat', bonusLeft: target !== null }

  // Held straight through this time: that earlier plank becomes the clean one, with the bonus added
  // to whichever of its records carries the XP.
  const carrier = Math.max(0, target!.findIndex((c) => c.xp))
  const updated = target!.map((c, i) => {
    const clean: Completion = { ...c }
    delete clean.pauses
    return i === carrier ? { ...clean, xp: (c.xp ?? 0) + gain } : clean
  })
  const byKey = new Map(updated.map((c) => [completionKey(c), c]))
  return {
    data: { ...next, completions: data.completions.map((c) => byKey.get(completionKey(c)) ?? c) },
    added: [],
    updated,
    gained: gain,
    lightXp: 0,
    kind: 'upgrade',
    bonusLeft: false,
  }
}

/**
 * The earlier plank a no-break go at this song would upgrade, as its records (a two-for-one has two),
 * or null when there's none. Candidates: today's plank of the song, and its ladder climbs from any
 * day, unless the level has already been held with no breaks. The latest plank with breaks wins.
 */
export function upgradeTarget(completions: readonly Completion[], songId: string, today: DayKey): Completion[] | null {
  const mine = completions.filter((c) => c.songId === songId)
  const levelDone = mine.some((c) => c.mode === 'ladder' && !c.pauses?.length)
  const candidates = mine.filter((c) => (c.mode === 'ladder' ? !levelDone : c.day === today))
  const withBreaks = candidates.filter((c) => c.pauses?.length).sort((a, b) => b.at.localeCompare(a.at))
  if (withBreaks.length === 0) return null
  // Every record of that plank: they share its finishing time.
  return mine.filter((c) => c.at === withBreaks[0].at)
}

/**
 * What a ladder level still has to give: all its XP the first time it's climbed; after that only
 * the no-break bonus, once, and only if every earlier climb had breaks.
 */
function ladderXpLeft(completions: readonly Completion[], songId: string, award: XpAward): { xp: number; bonusLeft: boolean } {
  const earlier = completions.filter((c) => c.mode === 'ladder' && c.songId === songId)
  if (earlier.length === 0) return { xp: award.total, bonusLeft: award.kind === 'held' }
  if (earlier.some((c) => !c.pauses?.length)) return { xp: 0, bonusLeft: false }
  if (award.kind === 'held') return { xp: 0, bonusLeft: true }
  // A two-for-one keeps its XP on the daily record, so count each earlier plank whole.
  const best = Math.max(...earlier.map((l) => totalXp(completions.filter((c) => c.at === l.at))))
  return { xp: Math.max(0, award.total - best), bonusLeft: false }
}

/** Which copy of the same plank to keep: more XP, then fewer breaks (the better go), then the earlier one. */
export function betterPlank(a: Completion, b: Completion): boolean {
  if ((a.xp ?? 0) !== (b.xp ?? 0)) return (a.xp ?? 0) > (b.xp ?? 0)
  const breaks = (c: Completion) => c.pauses?.length ?? 0
  if (breaks(a) !== breaks(b)) return breaks(a) < breaks(b)
  return a.at < b.at
}

/**
 * Union of two histories, keeping the better copy when both have the same plank. XP can be added
 * on the account after the browser recorded a plank, and a replay can improve today's record.
 */
export function mergeCompletions(a: readonly Completion[], b: readonly Completion[]): Completion[] {
  const byKey = new Map<string, Completion>()
  for (const c of [...a, ...b]) {
    const existing = byKey.get(completionKey(c))
    if (!existing || betterPlank(c, existing)) byKey.set(completionKey(c), c)
  }
  return [...byKey.values()].sort((x, y) => x.day.localeCompare(y.day) || x.at.localeCompare(y.at) || x.mode.localeCompare(y.mode))
}

export function newerCursor(a: LadderCursor, b: LadderCursor): LadderCursor {
  return b.updatedAt > a.updatedAt ? b : a
}

/**
 * Settings kept in both places (sound, themes): whichever copy was changed last wins. A copy never
 * changed has no time, so a new device takes the account's, and an account with none takes this one's.
 */
export function newerSettings(local: { updatedAt?: string }, remote: { updatedAt?: string } | null): 'local' | 'remote' | 'same' {
  const here = local.updatedAt ?? ''
  const there = remote?.updatedAt ?? ''
  if (here === there) return 'same'
  return here > there ? 'local' : 'remote'
}

/** How a ladder level went: held with no breaks, or done with breaks (the fewest, over every go). */
export interface LevelRecord {
  clean: boolean
  breaks: number
}

/** Every ladder song you've planked, and how it went at best. */
export function ladderRecords(completions: readonly Completion[]): Map<string, LevelRecord> {
  const records = new Map<string, LevelRecord>()
  for (const c of completions) {
    if (c.mode !== 'ladder') continue
    const breaks = c.pauses?.length ?? 0
    const best = records.get(c.songId)
    if (!best || breaks < best.breaks) records.set(c.songId, { clean: breaks === 0, breaks })
  }
  return records
}

export function songFor(c: Completion): Song | undefined {
  return SONG_BY_ID.get(c.songId)
}
