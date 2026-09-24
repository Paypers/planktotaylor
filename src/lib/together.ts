import type { Pause } from './progress'

// How everyone did today: what goes with the +1 on today's count, and how the day's totals are told.
// Kept friendly: planks held with no breaks are a count, never a share, and breaks only ever show as
// where the song gets tough. Anonymous, and fun numbers rather than tamper-proof ones, like the counter.

/** The song in 20 slots, each 5% of it. */
export const SLOTS = 20
/** Breaks sent with one plank, at most: the database refuses more. */
export const MAX_BREAKS = 20
/** Planks before the toughest stretch is worth showing. */
export const TOUGHEST_AFTER = 20

export interface DailyStats {
  planks: number
  /** Planks held all the way through, with no breaks. */
  noBreak: number
  /** Seconds held, everyone together. */
  seconds: number
  /** Breaks in each slot of the song. */
  slices: number[]
}

/** The slot each break fell in, for the first MAX_BREAKS breaks. */
export function breakSlots(pauses: readonly Pause[], songSeconds: number): number[] {
  return pauses.slice(0, MAX_BREAKS).map((p) => Math.min(SLOTS - 1, Math.max(0, Math.floor((p.at / songSeconds) * SLOTS))))
}

/**
 * Where in the song breaks bunched up most: the middle of the busiest slot, to the nearest 10 seconds
 * (the earlier one on a tie). Null until enough people have planked, or when nobody took a break.
 */
export function toughestStretch(stats: DailyStats, songSeconds: number): number | null {
  if (stats.planks < TOUGHEST_AFTER) return null
  let busiest = -1
  let most = 0
  stats.slices.forEach((breaks, slot) => {
    if (breaks > most) {
      most = breaks
      busiest = slot
    }
  })
  if (busiest < 0) return null
  return Math.round((((busiest + 0.5) / SLOTS) * songSeconds) / 10) * 10
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/** "26 hours", "3 hours 20 minutes", "45 minutes". */
export function togetherTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours >= 10 || rest === 0) return plural(Math.round(minutes / 60), 'hour')
  return `${plural(hours, 'hour')} ${plural(rest, 'minute')}`
}

/** A daily_counts row, as the database sends it. A day counted before the stats has only its planks. */
export function readStats(row: unknown): DailyStats {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
  const count = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const slices = Array.isArray(r.break_slices) && r.break_slices.length === SLOTS ? r.break_slices.map(count) : Array<number>(SLOTS).fill(0)
  return { planks: count(r.planks), noBreak: count(r.no_break), seconds: count(r.seconds), slices }
}
