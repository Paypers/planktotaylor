/** A calendar day in the visitor's own timezone, formatted YYYY-MM-DD. */
export type DayKey = string

export function toDayKey(date: Date): DayKey {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now)
}

function parts(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** Local noon on that day, so DST shifts can never push it into a neighbouring date. */
export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = parts(key)
  return new Date(y, m - 1, d, 12)
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key)
  date.setDate(date.getDate() + days)
  return toDayKey(date)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export function formatLongDate(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatShortDate(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
