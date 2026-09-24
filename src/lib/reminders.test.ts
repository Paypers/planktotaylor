import { describe, expect, it } from 'vitest'
import { dueReminder, localClock, PUSH_SERVICE, reminderMessage, type ReminderRow } from './reminders'

const row = (fields: Partial<ReminderRow> = {}): ReminderRow => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  user_id: 'ana',
  p256dh: 'key',
  auth: 'secret',
  remind_at: '09:00',
  time_zone: 'Europe/London',
  evening: false,
  last_morning: null,
  last_evening: null,
  ...fields,
})
// 24 September 2026: London is on summer time (UTC+1).
const at = (utc: string) => new Date(`2026-09-24T${utc}:00Z`)
const style = { title: 'Style', length: '3:51' }

describe('reminders', () => {
  it('know the date and time where the player is', () => {
    expect(localClock(at('08:00'), 'Europe/London')).toEqual({ day: '2026-09-24', minute: 9 * 60 })
    // Late evening in UTC is already tomorrow in Tokyo, and still yesterday's morning in Los Angeles.
    expect(localClock(at('23:30'), 'Asia/Tokyo')).toEqual({ day: '2026-09-25', minute: 8 * 60 + 30 })
    expect(localClock(new Date('2026-09-24T03:00:00Z'), 'America/Los_Angeles')).toEqual({ day: '2026-09-23', minute: 20 * 60 })
    expect(localClock(at('08:00'), 'Not/AZone')).toBeNull()
  })

  it('go at their time, and within the hour after if a check was missed', () => {
    expect(dueReminder(row(), at('07:59'))).toBeNull()
    expect(dueReminder(row(), at('08:00'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(dueReminder(row(), at('08:45'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(dueReminder(row(), at('09:00'))).toBeNull()
  })

  it('go once a day at most, by the day where the player is', () => {
    expect(dueReminder(row({ last_morning: '2026-09-24' }), at('08:15'))).toBeNull()
    expect(dueReminder(row({ last_morning: '2026-09-23' }), at('08:15'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    // Tokyo at 08:30 on the 25th is the 24th in UTC: it's the 25th that counts.
    expect(dueReminder(row({ time_zone: 'Asia/Tokyo', remind_at: '08:30', last_morning: '2026-09-24' }), at('23:30'))).toEqual({
      kind: 'morning',
      day: '2026-09-25',
    })
  })

  it('nudge in the evening only for players who asked', () => {
    expect(dueReminder(row(), at('19:00'))).toBeNull()
    expect(dueReminder(row({ evening: true }), at('19:00'))).toEqual({ kind: 'evening', day: '2026-09-24' })
    expect(dueReminder(row({ evening: true, last_evening: '2026-09-24' }), at('19:30'))).toBeNull()
  })

  it("say today's song and the streak on the line", () => {
    const streak = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    expect(reminderMessage('morning', style, streak, '2026-09-24')).toEqual({
      title: 'Plank to Taylor',
      body: "Today's song is Style (3:51). Your 4-day streak is on the line.",
    })
    expect(reminderMessage('morning', style, new Set(), '2026-09-24')?.body).toBe("Today's song is Style (3:51).")
    expect(reminderMessage('morning', style, new Set(['2026-09-23']), '2026-09-24')?.body).toBe(
      "Today's song is Style (3:51). Keep your streak going.",
    )
    expect(reminderMessage('morning', null, new Set(), '2026-09-24')?.body).toBe("Today's song is waiting.")
  })

  it('stay quiet once today is done', () => {
    expect(reminderMessage('morning', style, new Set(['2026-09-24']), '2026-09-24')).toBeNull()
    expect(reminderMessage('evening', style, new Set(['2026-09-22', '2026-09-23', '2026-09-24']), '2026-09-24')).toBeNull()
  })

  it('nudge in the evening only with a streak of 3 or more, and say when a freeze can\'t cover today', () => {
    expect(reminderMessage('evening', style, new Set(['2026-09-22', '2026-09-23']), '2026-09-24')).toBeNull()
    expect(reminderMessage('evening', style, new Set(['2026-09-21', '2026-09-22', '2026-09-23']), '2026-09-24')?.body).toBe(
      'Still time for Style (3:51) today. Your 3-day streak is on the line.',
    )
    // Two days off in a row: freezes covered them, but not a third.
    expect(reminderMessage('morning', style, new Set(['2026-09-19', '2026-09-20', '2026-09-21']), '2026-09-24')?.body).toBe(
      "Today's song is Style (3:51). Your 3-day streak is on the line. A freeze can't cover today.",
    )
  })

  it('only ever send to the browsers\' push services', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QAbc',
      'https://wns2-bl2p.notify.windows.com/w/?token=abc',
    ])
      expect(PUSH_SERVICE.test(ok), ok).toBe(true)
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://localhost/x'])
      expect(PUSH_SERVICE.test(bad), bad).toBe(false)
  })
})
