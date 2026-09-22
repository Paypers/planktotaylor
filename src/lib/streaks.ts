import { addDays, daysBetween, type DayKey } from './dates'

export interface StreakInfo {
  /** Consecutive days ending today, or ending yesterday if today isn't done yet. */
  current: number
  best: number
  doneToday: boolean
  /** A streak is alive but today hasn't been planked yet. */
  atRisk: boolean
}

export function streakInfo(days: ReadonlySet<DayKey>, today: DayKey): StreakInfo {
  const doneToday = days.has(today)
  let cursor: DayKey | null = doneToday ? today : days.has(addDays(today, -1)) ? addDays(today, -1) : null
  let current = 0
  while (cursor && days.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  let best = 0
  let run = 0
  let previous: DayKey | null = null
  for (const day of [...days].sort()) {
    run = previous && daysBetween(previous, day) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }

  return { current, best, doneToday, atRisk: !doneToday && current > 0 }
}

/** For each planked day, the length of the consecutive run it belongs to. */
export function runLengths(days: ReadonlySet<DayKey>): Map<DayKey, number> {
  const lengths = new Map<DayKey, number>()
  const sorted = [...days].sort()
  let start = 0
  for (let i = 1; i <= sorted.length; i++) {
    const broken = i === sorted.length || daysBetween(sorted[i - 1], sorted[i]) !== 1
    if (broken) {
      for (let j = start; j < i; j++) lengths.set(sorted[j], i - start)
      start = i
    }
  }
  return lengths
}
