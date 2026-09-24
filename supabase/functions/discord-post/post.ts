// The Discord daily post, sent by index.ts every 15 minutes (the schedule is in supabase/schema.sql). Each
// channel whose time has come gets today's song at 8:00, or how everyone did at 21:00, in its time zone.
// When and what come from the site itself (../_shared/site.js, built from src/lib/discord.ts by
// `npm run functions:build`); today's song comes from the live site's daily.json.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { postTo, type PostResult } from '../_shared/discord.ts'
import { duePost, hideTokens, morningPost, nightPost, readStats } from '../_shared/site.js'

export interface WebhookRow {
  id: string
  url: string
  time_zone: string
  last_morning: string | null
  last_night: string | null
}

type Kind = 'morning' | 'night'
type Song = { id: string; title: string; seconds: number; length: string; album: string; number: number }
type Schedule = Record<string, Song>
type Stats = ReturnType<typeof readStats>

/** Everything the posting needs from outside, so it can be tried without a database or Discord. */
export interface Deps {
  /** The live site's address, for the links. */
  site: string
  webhooks(): Promise<WebhookRow[]>
  schedule(): Promise<Schedule>
  /** How everyone did on a day, from the daily counter. */
  stats(day: string): Promise<Stats>
  post(row: WebhookRow, message: object): Promise<PostResult>
  markSent(row: WebhookRow, kind: Kind, day: string): Promise<void>
  remove(row: WebhookRow): Promise<void>
  wait(seconds: number): Promise<void>
  /** Milliseconds since the check began. */
  elapsed(): number
}

export interface Report {
  due: number
  sent: number
  /** Nothing to say: nobody's planked today yet, at night. */
  quiet: number
  /** Webhooks deleted in Discord, now deleted here too. */
  removed: number
  /** Couldn't be sent this time: tried again on the next check, within the hour. */
  failed: number
  /** Held up by Discord's rate limit, or out of time: left for the next check. */
  later: number
}

/** Tries at a post held up by Discord's rate limit, and the longest wait between them within one check. */
const TRIES = 3
const LONGEST_WAIT_SECONDS = 10
/** Posts at once: a few, so Discord's rate limit rarely comes into it. */
const AT_ONCE = 5
/** No new posts are started after this long, so the function finishes well inside its time. */
const TIME_BUDGET_MS = 100_000
const PAGE_SIZE = 1000

export async function postDue(deps: Deps, now = new Date()): Promise<Report> {
  const report: Report = { due: 0, sent: 0, quiet: 0, removed: 0, failed: 0, later: 0 }
  const due = (await deps.webhooks()).flatMap((row) => {
    // site.js is plain JavaScript: its types are only what Deno can guess, so say what this is.
    const post = duePost(row, now) as { kind: Kind; day: string } | null
    return post ? [{ row, ...post }] : []
  })
  report.due = due.length
  if (due.length === 0) return report

  const schedule = await deps.schedule()
  // Each day's counts are read once, however many channels post them.
  const stats = new Map<string, Promise<Stats>>()
  const statsFor = (day: string) => {
    if (!stats.has(day)) stats.set(day, deps.stats(day))
    return stats.get(day)!
  }

  for (let i = 0; i < due.length; i += AT_ONCE) {
    if (deps.elapsed() > TIME_BUDGET_MS) {
      report.later += due.length - i
      break
    }
    await Promise.all(
      due.slice(i, i + AT_ONCE).map(async ({ row, kind, day }) => {
        try {
          const song = schedule[day] ?? null
          const message = kind === 'morning' ? morningPost(deps.site, song) : nightPost(deps.site, song, await statsFor(day))
          if (!message) {
            report.quiet++
            await deps.markSent(row, kind, day)
            return
          }
          const result = await postWithWaits(deps, row, message)
          if (result.status === 'sent') {
            report.sent++
            await deps.markSent(row, kind, day)
          } else if (result.status === 'gone') {
            report.removed++
            await deps.remove(row)
          } else if (result.status === 'wait') {
            report.later++
          } else {
            report.failed++
            console.error('Discord post not sent', row.id, result.detail)
          }
        } catch (error) {
          report.failed++
          console.error('Discord post not sent', row.id, hideTokens(String(error)))
        }
      }),
    )
  }
  return report
}

/** Posts, waiting as long as Discord asks when it's too fast: a few times, and never long. */
async function postWithWaits(deps: Deps, row: WebhookRow, message: object): Promise<PostResult> {
  for (let tries = 1; ; tries++) {
    const result = await deps.post(row, message)
    if (result.status !== 'wait' || tries === TRIES || result.seconds > LONGEST_WAIT_SECONDS) return result
    await deps.wait(result.seconds)
  }
}

/** The real thing: the database through the service key, today's song from the site, posts to Discord. */
export function liveDeps(env: (name: string) => string | undefined): Deps {
  const need = (name: string) => {
    const value = env(name)
    if (!value) throw new Error(`Missing secret ${name}`)
    return value
  }
  const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const site = (env('SITE_URL') ?? 'https://planktotaylor.pages.dev').replace(/\/$/, '')
  const started = Date.now()

  return {
    site,
    async webhooks() {
      // A page at a time: the API sends at most 1000 rows per request.
      const rows: WebhookRow[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .from('discord_webhooks')
          .select('id, url, time_zone, last_morning, last_night')
          .order('id')
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data as WebhookRow[]))
        if (data.length < PAGE_SIZE) return rows
      }
    },
    async schedule() {
      const response = await fetch(`${site}/daily.json`, { headers: { 'cache-control': 'no-cache' } })
      if (!response.ok) throw new Error(`daily.json: ${response.status}`)
      return ((await response.json()) as { days: Schedule }).days
    },
    async stats(day) {
      const { data, error } = await db.from('daily_counts').select('planks, no_break, seconds, break_slices').eq('day', day).maybeSingle()
      if (error) throw error
      return readStats(data)
    },
    post: (row, message) => postTo(row.url, message),
    async markSent(row, kind, day) {
      const { error } = await db
        .from('discord_webhooks')
        .update(kind === 'morning' ? { last_morning: day } : { last_night: day })
        .eq('id', row.id)
      if (error) throw error
    },
    async remove(row) {
      const { error } = await db.from('discord_webhooks').delete().eq('id', row.id)
      if (error) throw error
    },
    wait: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
    elapsed: () => Date.now() - started,
  }
}
