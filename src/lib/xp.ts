import type { Completion, Pause } from './progress'

// XP for a finished plank. Only signed-in players earn it; the numbers all live here so they're easy to tune.

/** A point for every second of song held. Breaks never cost anything. */
export const XP_PER_SECOND = 1
/** Held the whole song without a break: half as much again. */
export const CLEAN_BONUS = 0.5
/** Without a break on a song this long or longer (Dear John, Last Kiss, All Too Well (10 Minute Version)): double. */
export const MARATHON_SECONDS = 6 * 60
export const MARATHON_BONUS = 1
/** Getting from rank n to n + 1 takes this × n XP: rank 2 at 500, rank 3 at 1,500, rank 5 at 5,000, rank 10 at 22,500. */
export const RANK_STEP = 500

/**
 * held      took breaks: the base XP
 * clean     no breaks: plus the bonus
 * marathon  no breaks on a 6-minute-plus song: plus the big bonus
 */
export type XpKind = 'held' | 'clean' | 'marathon'

export interface XpAward {
  base: number
  bonus: number
  total: number
  kind: XpKind
}

export function plankXp(seconds: number, pauses: readonly Pause[]): XpAward {
  const base = Math.round(seconds * XP_PER_SECOND)
  const kind: XpKind = pauses.length > 0 ? 'held' : seconds >= MARATHON_SECONDS ? 'marathon' : 'clean'
  const bonus = kind === 'held' ? 0 : Math.round(base * (kind === 'marathon' ? MARATHON_BONUS : CLEAN_BONUS))
  return { base, bonus, total: base + bonus, kind }
}

export function totalXp(completions: readonly Completion[]): number {
  return completions.reduce((sum, c) => sum + (c.xp ?? 0), 0)
}

export interface RankInfo {
  rank: number
  xp: number
  /** XP where this rank began, and where the next one starts. */
  floor: number
  next: number
}

/** Total XP where rank n begins: 0, 500, 1,500, 3,000… */
export function rankFloor(rank: number): number {
  return (RANK_STEP * rank * (rank - 1)) / 2
}

export function rankFor(xp: number): RankInfo {
  let rank = 1
  let floor = 0
  while (xp >= floor + RANK_STEP * rank) {
    floor += RANK_STEP * rank
    rank++
  }
  return { rank, xp, floor, next: floor + RANK_STEP * rank }
}
