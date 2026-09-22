import type { SupabaseClient, User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import type { DayKey } from './dates'
import {
  completionKey,
  mergeCompletions,
  newerCursor,
  type Completion,
  type LadderCursor,
  type Mode,
  type Pause,
} from './progress'
import { getData, onPlankRecorded, replaceProgress } from './store'

// Just the project address. The dashboard's Data API page shows it with /rest/v1/ on the end, which breaks sign-in.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/(rest|auth)\/v1\/?$/, '')
  .replace(/\/+$/, '')
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** False when the site runs without accounts: everything still works, stored in the browser. */
export const accountsEnabled = Boolean(url && key)

let clientPromise: Promise<SupabaseClient> | null = null

/** Loads supabase-js on demand, so sites without accounts never download it. */
function client(): Promise<SupabaseClient> {
  if (!accountsEnabled) return Promise.reject(new Error('Accounts are not set up on this site.'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const supabase = createClient(url!, key!, {
      // Implicit flow: the magic link carries the session itself, so it still signs you in when
      // the email is opened in a different browser from the one that asked for it.
      auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
    })
    listen(supabase)
    return supabase
  })
  return clientPromise
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface AccountState {
  user: User | null
  sync: SyncStatus
}

let state: AccountState = { user: null, sync: 'idle' }
const listeners = new Set<() => void>()

function setState(patch: Partial<AccountState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}

interface CompletionRow {
  user_id: string
  day: string
  mode: Mode
  song_id: string
  level: number | null
  seconds: number
  completed_at: string
  pauses: Pause[] | null
}

const toRow = (userId: string, c: Completion): CompletionRow => ({
  user_id: userId,
  day: c.day,
  mode: c.mode,
  song_id: c.songId,
  level: c.level ?? null,
  seconds: c.seconds,
  completed_at: c.at,
  pauses: c.pauses ?? null,
})

const fromRow = (row: CompletionRow): Completion => ({
  day: row.day,
  mode: row.mode,
  songId: row.song_id,
  level: row.level ?? undefined,
  seconds: row.seconds,
  // Postgres formats timestamps differently from JS; normalise so string comparisons hold.
  at: new Date(row.completed_at).toISOString(),
  ...(row.pauses?.length ? { pauses: row.pauses } : {}),
})

async function fetchAllCompletions(supabase: SupabaseClient): Promise<Completion[]> {
  const pageSize = 1000
  const rows: CompletionRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('plank_completions')
      .select('user_id, day, mode, song_id, level, seconds, completed_at, pauses')
      .order('day')
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data as CompletionRow[]))
    if (data.length < pageSize) return rows.map(fromRow)
  }
}

async function upsertCompletions(supabase: SupabaseClient, userId: string, completions: Completion[]) {
  const { error } = await supabase
    .from('plank_completions')
    .upsert(completions.map((c) => toRow(userId, c)), { onConflict: 'user_id,day,mode', ignoreDuplicates: true })
  if (error) throw error
}

async function pushLadderCursor(supabase: SupabaseClient, userId: string, ladder: LadderCursor) {
  const { error } = await supabase
    .from('plank_profiles')
    .upsert({ user_id: userId, ladder_level: ladder.level, updated_at: ladder.updatedAt })
  if (error) throw error
}

/** Two-way merge: pull the account's history, union it with this browser's, push back what's missing. */
async function syncNow(user: User) {
  setState({ sync: 'syncing' })
  try {
    const supabase = await client()
    const [remote, profile] = await Promise.all([
      fetchAllCompletions(supabase),
      supabase.from('plank_profiles').select('ladder_level, updated_at').maybeSingle(),
    ])
    if (profile.error) throw profile.error

    const local = getData()
    const merged = mergeCompletions(local.completions, remote)
    const remoteCursor: LadderCursor | null = profile.data
      ? { level: profile.data.ladder_level, updatedAt: new Date(profile.data.updated_at).toISOString() }
      : null
    const ladder = remoteCursor ? newerCursor(local.ladder, remoteCursor) : local.ladder
    replaceProgress(merged, ladder)

    const remoteKeys = new Set(remote.map(completionKey))
    const missing = merged.filter((c) => !remoteKeys.has(completionKey(c)))
    if (missing.length > 0) await upsertCompletions(supabase, user.id, missing)
    if (ladder !== remoteCursor) await pushLadderCursor(supabase, user.id, ladder)
    setState({ sync: 'synced' })
  } catch (error) {
    console.error('Sync failed', error)
    setState({ sync: 'error' })
  }
}

function listen(supabase: SupabaseClient) {
  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null
    const changedUser = user?.id !== state.user?.id
    setState({ user, sync: user ? state.sync : 'idle' })
    // Supabase warns against awaiting other Supabase calls inside this callback.
    if (user && (changedUser || event === 'SIGNED_IN')) setTimeout(() => void syncNow(user), 0)
  })

  onPlankRecorded((added, ladder) => {
    const user = state.user
    if (!user) return
    void (async () => {
      try {
        await upsertCompletions(supabase, user.id, added)
        if (added.some((c) => c.mode === 'ladder')) await pushLadderCursor(supabase, user.id, ladder)
        setState({ sync: 'synced' })
      } catch (error) {
        console.error('Could not save plank to account', error)
        setState({ sync: 'error' })
      }
    })()
  })
}

// Start right away so a returning magic link (#access_token=…) is picked up on page load.
if (accountsEnabled) void client()

export function retrySync() {
  if (state.user) void syncNow(state.user)
}

export async function saveLadderCursor(ladder: LadderCursor) {
  const user = state.user
  if (!accountsEnabled || !user) return
  try {
    await pushLadderCursor(await client(), user.id, ladder)
  } catch (error) {
    console.error('Could not save ladder level', error)
    setState({ sync: 'error' })
  }
}

function siteUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

export async function sendSignInEmail(email: string) {
  const { error } = await (await client()).auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() } })
  if (error) throw error
}

export async function verifySignInCode(email: string, token: string) {
  const { error } = await (await client()).auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export async function signOut() {
  if (accountsEnabled) await (await client()).auth.signOut()
}

/** How many people finished today's global song. Null when accounts aren't configured. */
export async function fetchDailyCount(day: DayKey): Promise<number | null> {
  if (!accountsEnabled) return null
  const { data, error } = await (await client()).from('daily_counts').select('planks').eq('day', day).maybeSingle()
  if (error) return null
  return data?.planks ?? 0
}

export async function bumpDailyCount(day: DayKey): Promise<number | null> {
  if (!accountsEnabled) return null
  const { data, error } = await (await client()).rpc('bump_daily', { p_day: day })
  if (error) return null
  return data as number
}
