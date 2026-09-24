import { addDays, type DayKey } from './dates'

// Streak freezes: a missed day uses one automatically while a streak is alive, so a day away doesn't end
// it. The numbers all live here so they're easy to tune. Everything is worked out from the planked days,
// so there's nothing extra to store or sync.

/** Freezes each calendar month. They refill on the 1st; unused ones don't carry over. */
export const FREEZES_PER_MONTH = 3
/** Missed days in a row freezes can cover. One more ends the streak, freezes left or not. */
export const MAX_MISSED_IN_A_ROW = 2

export interface StreakInfo {
  /** Days planked in the streak that's alive: ending today, or at yesterday if today isn't done yet. */
  current: number
  best: number
  doneToday: boolean
  /** A streak is alive but today hasn't been planked yet. */
  atRisk: boolean
  /** Missing today would end the streak: freezes have covered the most days in a row they can, or none are left. */
  lastChance: boolean
  /** Missed days a freeze covered. They keep a streak going but don't add to it. */
  frozen: ReadonlySet<DayKey>
  /** Freezes left this month. */
  freezesLeft: number
}

export interface StreakRuns {
  /** For each planked day, how many planked days its run has. */
  lengths: Map<DayKey, number>
  /** The last planked day of each run. */
  ends: Set<DayKey>
}

interface Walk extends StreakRuns {
  current: number
  best: number
  frozen: Set<DayKey>
  /** Freezes used, by month (YYYY-MM). */
  used: Map<string, number>
  /** Missed days in a row at the end of the alive streak. */
  missed: number
}

/** Every day from the first plank to today, in order, spending freezes on missed days as they come. */
function walk(days: ReadonlySet<DayKey>, today: DayKey): Walk {
  const sorted = [...days].filter((day) => day <= today).sort()
  const lengths = new Map<DayKey, number>()
  const ends = new Set<DayKey>()
  const frozen = new Set<DayKey>()
  const used = new Map<string, number>()
  let best = 0
  let run: DayKey[] = []
  let missed = 0

  const endRun = () => {
    for (const day of run) lengths.set(day, run.length)
    if (run.length > 0) ends.add(run[run.length - 1])
    best = Math.max(best, run.length)
    run = []
    missed = 0
  }

  for (let day = sorted[0]; day && day <= today; day = addDays(day, 1)) {
    if (days.has(day)) {
      run.push(day)
      missed = 0
      continue
    }
    // Today isn't missed until it's over, and with no streak alive there's nothing to keep.
    if (day === today || run.length === 0) continue
    const month = day.slice(0, 7)
    const spent = used.get(month) ?? 0
    if (missed < MAX_MISSED_IN_A_ROW && spent < FREEZES_PER_MONTH) {
      frozen.add(day)
      used.set(month, spent + 1)
      missed++
    } else {
      endRun()
    }
  }

  const current = run.length
  const trailing = missed
  endRun()
  return { current, best, frozen, used, missed: trailing, lengths, ends }
}

export function streakInfo(days: ReadonlySet<DayKey>, today: DayKey): StreakInfo {
  const { current, best, frozen, used, missed } = walk(days, today)
  const doneToday = days.has(today)
  const freezesLeft = FREEZES_PER_MONTH - (used.get(today.slice(0, 7)) ?? 0)
  const atRisk = !doneToday && current > 0
  return {
    current,
    best,
    doneToday,
    atRisk,
    lastChance: atRisk && (missed >= MAX_MISSED_IN_A_ROW || freezesLeft === 0),
    frozen,
    freezesLeft,
  }
}

/** Runs of planked days for the calendar. A run carries on across its frozen days. */
export function streakRuns(days: ReadonlySet<DayKey>, today: DayKey): StreakRuns {
  const { lengths, ends } = walk(days, today)
  return { lengths, ends }
}
