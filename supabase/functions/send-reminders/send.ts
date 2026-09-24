// Daily reminders, sent by index.ts every 15 minutes (the schedule is in supabase/schema.sql). Each device
// whose reminder time has come gets a push with today's song and its player's streak, unless today's song
// is already done. Who's due and what it says come from the site itself (../_shared/site.js, built from
// src/lib/reminders.ts by `npm run functions:build`); today's song comes from the live site's daily.json.
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { dueReminder, PUSH_SERVICE, reminderMessage } from '../_shared/site.js'

export interface ReminderRow {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  remind_at: string
  time_zone: string
  evening: boolean
  last_morning: string | null
  last_evening: string | null
}

type Kind = 'morning' | 'evening'

/** The most rows the API sends in one go. */
const PAGE_SIZE = 1000
type Message = { title: string; body: string }
type Schedule = Record<string, { title: string; length: string }>

/** Everything the sending needs from outside, so it can be tried without a database or a push service. */
export interface Deps {
  subscriptions(): Promise<ReminderRow[]>
  /** The days each player planked today's song. */
  dailyDays(userIds: string[]): Promise<Map<string, Set<string>>>
  schedule(): Promise<Schedule>
  /** 'gone' when the push service says the subscription no longer exists. */
  send(row: ReminderRow, message: Message): Promise<'sent' | 'gone'>
  markSent(row: ReminderRow, kind: Kind, day: string): Promise<void>
  remove(row: ReminderRow): Promise<void>
}

export interface Report {
  due: number
  sent: number
  /** Today's song was already done (or no nudge was needed). */
  quiet: number
  /** Subscriptions the push service no longer has, now deleted. */
  removed: number
  /** Couldn't be sent this time: tried again on the next check, within the hour. */
  failed: number
}

export async function sendDue(deps: Deps, now = new Date()): Promise<Report> {
  const report: Report = { due: 0, sent: 0, quiet: 0, removed: 0, failed: 0 }
  const due = (await deps.subscriptions()).flatMap((row) => {
    // site.js is plain JavaScript: its types are only what Deno can guess, so say what this is.
    const reminder = dueReminder(row, now) as { kind: Kind; day: string } | null
    return reminder ? [{ row, ...reminder }] : []
  })
  report.due = due.length
  if (due.length === 0) return report

  const [days, schedule] = await Promise.all([deps.dailyDays([...new Set(due.map((d) => d.row.user_id))]), deps.schedule()])
  // A few at a time, so one slow push service doesn't hold up everyone.
  for (let i = 0; i < due.length; i += 20) {
    await Promise.all(
      due.slice(i, i + 20).map(async ({ row, kind, day }) => {
        try {
          const message = reminderMessage(kind, schedule[day] ?? null, days.get(row.user_id) ?? new Set(), day)
          if (message) {
            if ((await deps.send(row, message)) === 'gone') {
              await deps.remove(row)
              report.removed++
              return
            }
            report.sent++
          } else {
            report.quiet++
          }
          // Marked either way: at most once a day, and a player who's already planked isn't asked again.
          await deps.markSent(row, kind, day)
        } catch (error) {
          report.failed++
          console.error('Reminder not sent', row.endpoint.slice(0, 60), error)
        }
      }),
    )
  }
  return report
}

/** The real thing: the database through the service key, today's song from the site, pushes signed with the VAPID keys. */
export async function liveDeps(env: (name: string) => string | undefined): Promise<Deps> {
  const need = (name: string) => {
    const value = env(name)
    if (!value) throw new Error(`Missing secret ${name}`)
    return value
  }
  const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const site = (env('SITE_URL') ?? 'https://planktotaylor.pages.dev').replace(/\/$/, '')
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(need('VAPID_KEYS')))
  const server = await webpush.ApplicationServer.new({ contactInformation: env('VAPID_SUBJECT') ?? site, vapidKeys })

  return {
    async subscriptions() {
      // A page at a time: the API sends at most 1000 rows per request.
      const rows: ReminderRow[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db.from('push_subscriptions').select('*').order('endpoint').range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data as ReminderRow[]))
        if (data.length < PAGE_SIZE) return rows
      }
    },
    async dailyDays(userIds) {
      const days = new Map<string, Set<string>>()
      const pageSize = PAGE_SIZE
      // A hundred players at a time keeps each request's address short.
      for (let i = 0; i < userIds.length; i += 100) {
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await db
            .from('plank_completions')
            .select('user_id, day')
            .eq('mode', 'daily')
            .in('user_id', userIds.slice(i, i + 100))
            .order('user_id')
            .order('day')
            .range(from, from + pageSize - 1)
          if (error) throw error
          for (const { user_id, day } of data as { user_id: string; day: string }[]) days.set(user_id, (days.get(user_id) ?? new Set()).add(day))
          if (data.length < pageSize) break
        }
      }
      return days
    },
    async schedule() {
      const response = await fetch(`${site}/daily.json`, { headers: { 'cache-control': 'no-cache' } })
      if (!response.ok) throw new Error(`daily.json: ${response.status}`)
      return ((await response.json()) as { days: Schedule }).days
    },
    async send(row, message) {
      // Only ever to a browser's push service, whatever's in the table.
      if (!PUSH_SERVICE.test(row.endpoint)) return 'gone'
      const subscriber = server.subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })
      try {
        // A day's reminders share a topic: an evening nudge replaces a morning one the phone never showed.
        await subscriber.pushTextMessage(JSON.stringify(message), {
          ttl: 12 * 60 * 60,
          urgency: webpush.Urgency.Normal,
          topic: 'today',
        })
        return 'sent'
      } catch (error) {
        if (error instanceof webpush.PushMessageError && error.isGone()) return 'gone'
        throw error
      }
    },
    async markSent(row, kind, day) {
      const { error } = await db
        .from('push_subscriptions')
        .update(kind === 'morning' ? { last_morning: day } : { last_evening: day })
        .eq('endpoint', row.endpoint)
      if (error) throw error
    },
    async remove(row) {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
      if (error) throw error
    },
  }
}
