// A preview of a channel's night card, for Settings → Discord: how everyone did today, or how a group did,
// drawn exactly as the post will be. For signed-in players; a group's only for its members.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { loadGroupBoard, type GroupBoard } from '../_shared/board.ts'
import { drawCard, type Card } from '../_shared/cards.ts'
import { everyoneCard, groupCard, groupNight, knownZone, localClock, readStats } from '../_shared/site.js'

type Song = { id: string; title: string; seconds: number; length: string; album: string; number: number }
type Stats = ReturnType<typeof readStats>

export type Problem = 'sign-in' | 'bad-request' | 'not-member'
export type Preview = { png: Uint8Array } | { empty: true } | { problem: Problem }

export interface Deps {
  site: string
  /** The signed-in player's id from their access token, or null. */
  player(token: string): Promise<string | null>
  member(groupId: string, userId: string): Promise<boolean>
  song(day: string): Promise<Song | null>
  stats(day: string): Promise<Stats>
  group(id: string, day: string): Promise<GroupBoard | null>
  draw(card: Card): Promise<Uint8Array>
}

const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function preview(deps: Deps, token: string | null, body: unknown, now = new Date()): Promise<Preview> {
  const userId = token ? await deps.player(token) : null
  if (!userId) return { problem: 'sign-in' }
  const given = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const { timeZone, night, group } = given
  if (typeof timeZone !== 'string' || !knownZone(timeZone)) return { problem: 'bad-request' }
  // Today, where the channel is.
  const day = (localClock(now, timeZone) as { day: string }).day
  const song = await deps.song(day)

  if (night === 'group') {
    if (typeof group !== 'string' || !GROUP_ID.test(group)) return { problem: 'bad-request' }
    if (!(await deps.member(group, userId))) return { problem: 'not-member' }
    const board = await deps.group(group, day)
    if (!board) return { problem: 'not-member' }
    const card = groupCard(song, groupNight(board, board.board, day), day) as Card | null
    return card ? { png: await deps.draw(card) } : { empty: true }
  }
  if (night !== 'everyone') return { problem: 'bad-request' }
  const card = everyoneCard(song, await deps.stats(day), day) as Card | null
  return card ? { png: await deps.draw(card) } : { empty: true }
}

export function liveDeps(env: (name: string) => string | undefined): Deps {
  const need = (name: string) => {
    const value = env(name)
    if (!value) throw new Error(`Missing secret ${name}`)
    return value
  }
  const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const site = (env('SITE_URL') ?? 'https://planktotaylor.pages.dev').replace(/\/$/, '')
  return {
    site,
    async player(token) {
      const { data, error } = await db.auth.getUser(token)
      return error || !data.user ? null : data.user.id
    },
    async member(groupId, userId) {
      const { data, error } = await db.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle()
      if (error) throw error
      return data !== null
    },
    async song(day) {
      const response = await fetch(`${site}/daily.json`, { headers: { 'cache-control': 'no-cache' } })
      if (!response.ok) return null
      return ((await response.json()) as { days: Record<string, Song> }).days[day] ?? null
    },
    async stats(day) {
      const { data, error } = await db.from('daily_counts').select('planks, no_break, seconds, break_slices').eq('day', day).maybeSingle()
      if (error) throw error
      return readStats(data)
    },
    group: (id, day) => loadGroupBoard(db, id, day),
    draw: (card) => drawCard(card, site),
  }
}
