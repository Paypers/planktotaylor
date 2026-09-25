// The Discord daily post, sent by index.ts every 15 minutes (the schedule is in supabase/schema.sql). Each
// channel whose time has come gets today's song at 8:00, or at 21:00 how everyone did (or, for a channel
// that posts a group, how the group did), in its time zone, each with a card drawn under it. When and what
// come from the site itself (../_shared/site.js, built from src/lib/discord.ts by
// `npm run functions:build`); today's song comes from the live site's daily.json.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { loadGroupBoard, type GroupBoard } from '../_shared/board.ts'
import { drawCard, type Card } from '../_shared/cards.ts'
import { postTo, type PostResult } from '../_shared/discord.ts'
import {
  duePost,
  everyoneCard,
  groupCard,
  groupNight,
  groupNightPost,
  hideTokens,
  morningCard,
  morningPost,
  nightPost,
  readStats,
} from '../_shared/site.js'

export interface WebhookRow {
  id: string
  url: string
  time_zone: string
  last_morning: string | null
  last_night: string | null
  /** A group this channel posts at night, instead of how everyone did. */
  group_id: string | null
}

type Kind = 'morning' | 'night'
type Song = { id: string; title: string; seconds: number; length: string; album: string; number: number; short?: string; color?: string; ink?: string }
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
  /** A group's board on a day; null if it's gone. */
  group(id: string, day: string): Promise<GroupBoard | null>
  /** A card as a PNG. */
  draw(card: Card): Promise<Uint8Array>
  post(row: WebhookRow, message: object, picture: Uint8Array | null): Promise<PostResult>
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
  /** Sent without their card, which couldn't be drawn: the words say it all anyway. */
  plain: number
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
  const report: Report = { due: 0, sent: 0, quiet: 0, removed: 0, failed: 0, later: 0, plain: 0 }
  const due = (await deps.webhooks()).flatMap((row) => {
    // site.js is plain JavaScript: its types are only what Deno can guess, so say what this is.
    const post = duePost(row, now) as { kind: Kind; day: string } | null
    return post ? [{ row, ...post }] : []
  })
  report.due = due.length
  if (due.length === 0) return report

  const schedule = await deps.schedule()
  // Each day's counts, each group's board and each card are made once, however many channels post them.
  const once = <T>(memo: Map<string, Promise<T>>, key: string, make: () => Promise<T>) => {
    if (!memo.has(key)) memo.set(key, make())
    return memo.get(key)!
  }
  const stats = new Map<string, Promise<Stats>>()
  const groups = new Map<string, Promise<GroupBoard | null>>()
  const pictures = new Map<string, Promise<Uint8Array | null>>()
  const statsFor = (day: string) => once(stats, day, () => deps.stats(day))
  const groupFor = (id: string, day: string) => once(groups, `${id} ${day}`, () => deps.group(id, day))
  // A card that can't be drawn leaves the post with its words alone.
  const pictureOf = (key: string, card: Card | null) =>
    card
      ? once(pictures, key, () =>
          deps.draw(card).catch((error) => {
            console.error('Discord card not drawn', key, String(error))
            return null
          }),
        )
      : Promise.resolve(null)

  /** What a channel posts now: the words, and its card. Null words: nothing to say. */
  const postFor = async (row: WebhookRow, kind: Kind, day: string): Promise<{ message: object | null; picture: Uint8Array | null; card: boolean }> => {
    const song = schedule[day] ?? null
    if (kind === 'morning') {
      const card = morningCard(song, day) as Card | null
      return { message: morningPost(deps.site, song), picture: await pictureOf(`morning ${day}`, card), card: card !== null }
    }
    const group = row.group_id ? await groupFor(row.group_id, day) : null
    if (group) {
      const night = groupNight(group, group.board, day)
      const card = groupCard(song, night, day) as Card | null
      return { message: groupNightPost(deps.site, night), picture: await pictureOf(`group ${row.group_id} ${day}`, card), card: card !== null }
    }
    const counts = await statsFor(day)
    const card = everyoneCard(song, counts, day) as Card | null
    return { message: nightPost(deps.site, song, counts), picture: await pictureOf(`everyone ${day}`, card), card: card !== null }
  }

  for (let i = 0; i < due.length; i += AT_ONCE) {
    if (deps.elapsed() > TIME_BUDGET_MS) {
      report.later += due.length - i
      break
    }
    await Promise.all(
      due.slice(i, i + AT_ONCE).map(async ({ row, kind, day }) => {
        try {
          const { message, picture, card } = await postFor(row, kind, day)
          if (!message) {
            report.quiet++
            await deps.markSent(row, kind, day)
            return
          }
          const result = await postWithWaits(deps, row, message, picture)
          if (result.status === 'sent') {
            report.sent++
            if (card && !picture) report.plain++
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
async function postWithWaits(deps: Deps, row: WebhookRow, message: object, picture: Uint8Array | null): Promise<PostResult> {
  for (let tries = 1; ; tries++) {
    const result = await deps.post(row, message, picture)
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
          .select('id, url, time_zone, last_morning, last_night, group_id')
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
    group: (id, day) => loadGroupBoard(db, id, day),
    draw: (card) => drawCard(card, site),
    post: (row, message, picture) => postTo(row.url, message, fetch, picture),
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
