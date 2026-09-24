import type { DayKey } from './dates'
import { streakInfo } from './streaks'

// Daily reminders: a push notification with today's song and your streak, at a time you pick, and on
// days you haven't planked yet an optional evening nudge. Signed-in players only: the server has to see
// whether today's song is done. What's here is shared by the site and the send-reminders Edge Function
// (bundled for it by `npm run functions:build`), so both always agree.

/** A new reminder's time, until it's changed. */
export const DEFAULT_REMINDER = '09:00'
/** The evening nudge, on days today's song isn't done yet. */
export const EVENING_NUDGE = '20:00'
/** The nudge only comes with a streak at least this long. Nagging makes people turn notifications off. */
export const NUDGE_STREAK = 3
/** The server checks this often, and reminder times are set in these steps. */
export const STEP_MINUTES = 15
/** A reminder that's missed its moment (a check that didn't run) still goes within this long. */
export const CATCH_UP_MINUTES = 60

/**
 * The push services browsers use: Chrome, Brave and Android (Google), Firefox (Mozilla), Safari (Apple),
 * Edge on Windows (Microsoft). The server only ever sends to these. schema.sql has the same list: keep
 * them in step.
 */
export const PUSH_SERVICE = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//

/** One device's reminder, as the database keeps it. */
export interface ReminderRow {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  /** "HH:MM", in STEP_MINUTES steps. */
  remind_at: string
  /** Where the player is: an IANA name like "Europe/London". */
  time_zone: string
  evening: boolean
  /** The last days each was sent, in the player's own time zone: each goes at most once a day. */
  last_morning: DayKey | null
  last_evening: DayKey | null
}

export type ReminderKind = 'morning' | 'evening'

/** The date and the minute of the day where the player is. Null for a time zone this runtime doesn't know. */
export function localClock(now: Date, timeZone: string): { day: DayKey; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    return { day: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) }
  } catch {
    return null
  }
}

const minuteOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** The reminder due for this device now, if any: its time has come (within the last hour) and it hasn't gone today. */
export function dueReminder(row: ReminderRow, now: Date): { kind: ReminderKind; day: DayKey } | null {
  const clock = localClock(now, row.time_zone)
  if (!clock) return null
  const due = (hhmm: string) => {
    const at = minuteOf(hhmm)
    return clock.minute >= at && clock.minute < at + CATCH_UP_MINUTES
  }
  if (due(row.remind_at) && row.last_morning !== clock.day) return { kind: 'morning', day: clock.day }
  if (row.evening && due(EVENING_NUDGE) && row.last_evening !== clock.day) return { kind: 'evening', day: clock.day }
  return null
}

/** Today's song, as the site's daily.json has it. */
export interface DaySong {
  title: string
  /** "3:51" */
  length: string
}

/**
 * What the reminder says, or null when it shouldn't go: today's song is already done, or it's the evening
 * nudge and the streak is under NUDGE_STREAK. `days`: the days the player planked today's song.
 */
export function reminderMessage(kind: ReminderKind, song: DaySong | null, days: ReadonlySet<DayKey>, day: DayKey): { title: string; body: string } | null {
  if (days.has(day)) return null
  const streak = streakInfo(days, day)
  if (kind === 'evening' && streak.current < NUDGE_STREAK) return null
  const named = song ? `${song.title} (${song.length})` : null
  const first =
    kind === 'morning'
      ? named
        ? `Today's song is ${named}.`
        : "Today's song is waiting."
      : named
        ? `Still time for ${named} today.`
        : "Still time for today's song."
  const second =
    streak.current >= 2 ? `Your ${streak.current}-day streak is on the line.` : streak.current === 1 ? 'Keep your streak going.' : ''
  const third = streak.lastChance ? "A freeze can't cover today." : ''
  return { title: 'Plank to Taylor', body: [first, second, third].filter(Boolean).join(' ') }
}
