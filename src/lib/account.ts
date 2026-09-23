import type { SupabaseClient, User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import type { DayKey } from './dates'
import {
  betterPlank,
  completionKey,
  emptyData,
  mergeCompletions,
  newerCursor,
  newerSettings,
  type Completion,
  type LadderCursor,
  type Mode,
  type Pause,
  type Prefs,
} from './progress'
import { forgetAttempts, getAttempts, mergeAttempts, onAttemptEnded, type AttemptKind, type AttemptOutcome } from './attempts'
import { applyPrefs, getData, onPlankRecorded, onPrefsChanged, replaceProgress } from './store'
import { applySavedTheme, onThemeSaved, readSaved, savedTheme, type SavedTheme } from './theme'

// The project address, without the /rest/v1/ the dashboard shows on the end (it breaks sign-in).
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
      // Implicit flow: the magic link carries the session, so it works in any browser.
      auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
    })
    listen(supabase)
    return supabase
  })
  return clientPromise
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

/** What a player chose to show: a name and a photo. Both optional. */
export interface Profile {
  name: string | null
  avatarUrl: string | null
}

const NO_PROFILE: Profile = { name: null, avatarUrl: null }

interface AccountState {
  user: User | null
  sync: SyncStatus
  profile: Profile
}

let state: AccountState = { user: null, sync: 'idle', profile: NO_PROFILE }
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
  xp: number | null
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
  xp: c.xp ?? null,
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
  ...(row.xp != null ? { xp: row.xp } : {}),
})

async function fetchAllCompletions(supabase: SupabaseClient): Promise<Completion[]> {
  const pageSize = 1000
  const rows: CompletionRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('plank_completions')
      .select('user_id, day, mode, song_id, level, seconds, completed_at, pauses, xp')
      .order('day')
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data as CompletionRow[]))
    if (data.length < pageSize) return rows.map(fromRow)
  }
}

/** New planks only: a plank the account already has is left as it is. */
async function upsertCompletions(supabase: SupabaseClient, userId: string, completions: Completion[]) {
  const { error } = await supabase
    .from('plank_completions')
    .upsert(completions.map((c) => toRow(userId, c)), { onConflict: 'user_id,day,mode,song_id', ignoreDuplicates: true })
  if (error) throw error
}

/** Planks a replay improved (breaks cleared, no-break bonus added): these overwrite the account's copy. */
async function replaceCompletions(supabase: SupabaseClient, userId: string, completions: Completion[]) {
  const { error } = await supabase
    .from('plank_completions')
    .upsert(completions.map((c) => toRow(userId, c)), { onConflict: 'user_id,day,mode,song_id' })
  if (error) throw error
}

async function pushLadderCursor(supabase: SupabaseClient, userId: string, ladder: LadderCursor) {
  const { error } = await supabase
    .from('plank_profiles')
    .upsert({ user_id: userId, ladder_level: ladder.level, updated_at: ladder.updatedAt })
  if (error) throw error
}

/** The account's row: ladder, name, photo and settings. */
interface ProfileRow {
  ladder_level: number
  updated_at: string
  display_name: string | null
  avatar_url: string | null
  prefs?: unknown
  theme?: unknown
}

/** Settings the account keeps a copy of. */
interface SettingsFields {
  prefs?: Prefs
  theme?: SavedTheme
}

/** The account's sound settings, or null if it has none. */
function readPrefs(value: unknown, fallback: Prefs): Prefs | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<Prefs>
  return {
    music: typeof v.music === 'boolean' ? v.music : fallback.music,
    sounds: typeof v.sounds === 'boolean' ? v.sounds : fallback.sounds,
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  }
}

/** Sound and themes: whichever copy was changed last, here or in the account, wins. */
async function syncSettings(supabase: SupabaseClient, userId: string, row: ProfileRow | null) {
  const push: SettingsFields = {}
  const prefs = getData().prefs
  const theirPrefs = readPrefs(row?.prefs, prefs)
  const prefsWinner = newerSettings(prefs, theirPrefs)
  if (prefsWinner === 'remote') applyPrefs(theirPrefs!)
  if (prefsWinner === 'local') push.prefs = prefs

  const theme = savedTheme()
  const theirTheme = row?.theme ? readSaved(row.theme) : null
  const themeWinner = newerSettings(theme, theirTheme)
  if (themeWinner === 'remote') applySavedTheme(theirTheme)
  if (themeWinner === 'local') push.theme = theme

  if (push.prefs || push.theme) await saveProfileRow(supabase, userId, push)
}

// The account whose progress this browser holds. Signing out keeps that progress, so someone
// else signing in here starts clean instead of merging it into their account.
const OWNER_KEY = 'plank-to-taylor:account'

function claimBrowser(userId: string) {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    // Storage is off: there's nothing kept from anyone else.
  }
  if (owner && owner !== userId) {
    replaceProgress([], emptyData().ladder)
    forgetAttempts()
    // Their settings stay on screen until this account's arrive, but never count as newer.
    const { updatedAt: _prefsAt, ...prefs } = getData().prefs
    applyPrefs(prefs)
    const { updatedAt: _themeAt, ...theme } = savedTheme()
    applySavedTheme(theme)
  }
}

let running: Promise<void> | null = null
let again = false
let lastSync = 0
/** Coming back to the site within this long of a sync doesn't sync again. */
const FRESH_MS = 30_000

/** One sync at a time: asked for during one, it runs once more straight after. */
function sync(user: User) {
  if (running) {
    again = true
    return
  }
  again = false
  lastSync = Date.now()
  running = syncNow(user).finally(() => {
    running = null
    if (again && state.user) sync(state.user)
  })
}

// Phones keep a tab open for days: coming back into view (or online) picks up other devices' changes.
function catchUp() {
  if (!state.user || document.visibilityState !== 'visible') return
  if (state.sync === 'error' || Date.now() - lastSync > FRESH_MS) sync(state.user)
}

/** Two-way merge: pull the account's history, union it with this browser's, push back what's missing. */
async function syncNow(user: User) {
  setState({ sync: 'syncing' })
  try {
    const supabase = await client()
    const [remote, profile] = await Promise.all([
      fetchAllCompletions(supabase),
      // The whole row, so a database that hasn't had the settings columns added yet still syncs the rest.
      supabase.from('plank_profiles').select('*').maybeSingle<ProfileRow>(),
    ])
    if (profile.error) throw profile.error
    const row = profile.data
    setState({ profile: { name: row?.display_name ?? null, avatarUrl: ownPhoto(row?.avatar_url) } })

    const local = getData()
    const merged = mergeCompletions(local.completions, remote)
    const remoteCursor: LadderCursor | null = row
      ? { level: row.ladder_level, updatedAt: new Date(row.updated_at).toISOString() }
      : null
    const ladder = remoteCursor ? newerCursor(local.ladder, remoteCursor) : local.ladder
    replaceProgress(merged, ladder)

    const remoteByKey = new Map(remote.map((c) => [completionKey(c), c]))
    const missing = merged.filter((c) => !remoteByKey.has(completionKey(c)))
    // A replay improved a plank here but that didn't reach the account (offline, say).
    const improved = merged.filter((c) => {
      const theirs = remoteByKey.get(completionKey(c))
      return theirs !== undefined && betterPlank(c, theirs)
    })
    if (missing.length > 0) await upsertCompletions(supabase, user.id, missing)
    if (improved.length > 0) await replaceCompletions(supabase, user.id, improved)
    if (ladder !== remoteCursor) await pushLadderCursor(supabase, user.id, ladder)
    // Settings and attempts aren't progress: a failure doesn't fail the sync, and the next one retries.
    await syncSettings(supabase, user.id, row).catch((error) => console.error('Could not sync settings with account', error))
    await pushAttempts(supabase, user.id).catch((error) => console.error('Could not save attempts to account', error))
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
    if (user && changedUser) claimBrowser(user.id)
    setState({ user, sync: user ? state.sync : 'idle', profile: changedUser ? NO_PROFILE : state.profile })
    // Supabase warns against awaiting other Supabase calls inside this callback.
    if (user && (changedUser || event === 'SIGNED_IN')) setTimeout(() => sync(user), 0)
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('online', catchUp)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) catchUp()
    })
  }

  onPlankRecorded((added, updated, ladder) => {
    const user = state.user
    if (!user) return
    void (async () => {
      try {
        if (added.length > 0) await upsertCompletions(supabase, user.id, added)
        if (updated.length > 0) await replaceCompletions(supabase, user.id, updated)
        await pushLadderCursor(supabase, user.id, ladder)
        setState({ sync: 'synced' })
      } catch (error) {
        console.error('Could not save plank to account', error)
        setState({ sync: 'error' })
      }
    })()
  })
}

interface AttemptRow {
  user_id: string
  id: string
  song_id: string
  kind: AttemptKind
  level: number | null
  started_at: string
  ended_at: string
  outcome: AttemptOutcome
  reached: number
  pauses: number
}

/** Sends attempts the account doesn't have yet. The account only ever adds them: none can be edited or removed. */
async function pushAttempts(supabase: SupabaseClient, userId: string) {
  const unsaved = getAttempts().filter((a) => !a.synced)
  if (unsaved.length === 0) return
  const rows: AttemptRow[] = unsaved.map((a) => ({
    user_id: userId,
    id: a.id,
    song_id: a.songId,
    kind: a.kind,
    level: a.level ?? null,
    started_at: a.startedAt,
    ended_at: a.endedAt,
    outcome: a.outcome,
    reached: a.reached,
    pauses: a.pauses,
  }))
  const { error } = await supabase.from('plank_attempts').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true })
  if (error) throw error
  mergeAttempts([], unsaved.map((a) => a.id))
}

/** The latest attempts from every device, for the history. */
export async function pullAttempts() {
  const user = state.user
  if (!accountsEnabled || !user) return
  const supabase = await client()
  await pushAttempts(supabase, user.id)
  const { data, error } = await supabase
    .from('plank_attempts')
    .select('id, song_id, kind, level, started_at, ended_at, outcome, reached, pauses')
    .order('started_at', { ascending: false })
    .limit(100)
  if (error) throw error
  mergeAttempts(
    (data as Omit<AttemptRow, 'user_id'>[]).map((row) => ({
      id: row.id,
      songId: row.song_id,
      kind: row.kind,
      ...(row.level != null ? { level: row.level } : {}),
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(),
      outcome: row.outcome,
      reached: Number(row.reached),
      pauses: row.pauses,
    })),
  )
}

/** A setting changed while signed in goes straight up. If that fails, the next sync sends it. */
async function pushSettings(fields: SettingsFields) {
  const user = state.user
  if (!accountsEnabled || !user) return
  try {
    await saveProfileRow(await client(), user.id, fields)
  } catch (error) {
    console.error('Could not save settings to account', error)
  }
}

// Signed in, attempts and settings go to the account as they happen. Signed out, nothing leaves the browser.
onAttemptEnded(() => {
  const user = state.user
  if (!accountsEnabled || !user) return
  void client()
    .then((supabase) => pushAttempts(supabase, user.id))
    .catch((error) => console.error('Could not save attempt to account', error))
})
onPrefsChanged((prefs) => void pushSettings({ prefs }))
onThemeSaved((theme) => void pushSettings({ theme }))

// Start right away so a returning magic link (#access_token=…) is picked up on page load.
if (accountsEnabled) void client()

export function retrySync() {
  if (state.user) sync(state.user)
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

/** The name to show: the one they chose, or the start of their email. */
export function displayName(user: User, profile: Profile): string {
  return profile.name || user.email?.split('@')[0] || 'You'
}

/**
 * Changes the name, photo or settings, never the ladder. A first row is seeded with this
 * browser's ladder, so it can't look like a newer one.
 */
async function saveProfileRow(
  supabase: SupabaseClient,
  userId: string,
  fields: SettingsFields & { display_name?: string | null; avatar_url?: string | null },
) {
  const updated = await supabase.from('plank_profiles').update(fields).eq('user_id', userId).select('user_id')
  if (updated.error) throw updated.error
  if (updated.data.length === 0) {
    const { ladder } = getData()
    const inserted = await supabase
      .from('plank_profiles')
      .insert({ user_id: userId, ladder_level: ladder.level, updated_at: ladder.updatedAt, ...fields })
    if (inserted.error) throw inserted.error
  }
}

async function saveProfile(fields: { display_name?: string | null; avatar_url?: string | null }) {
  const user = state.user
  if (!user) throw new Error('Sign in first.')
  await saveProfileRow(await client(), user.id, fields)
  setState({
    profile: {
      name: fields.display_name !== undefined ? fields.display_name : state.profile.name,
      avatarUrl: fields.avatar_url !== undefined ? fields.avatar_url : state.profile.avatarUrl,
    },
  })
}

export async function saveDisplayName(name: string) {
  await saveProfile({ display_name: name.trim().slice(0, 40) || null })
}

const avatarPath = (userId: string) => `${userId}/avatar.jpg`

/** Only a photo from this project's own bucket is ever shown. */
const ownPhoto = (link: string | null | undefined): string | null =>
  link?.startsWith(`${url}/storage/v1/object/public/avatars/`) ? link : null

/** Uploads an already-resized photo (see lib/avatar.ts) to the public avatars bucket. */
export async function uploadAvatar(photo: Blob) {
  const user = state.user
  if (!user) throw new Error('Sign in first.')
  const storage = (await client()).storage.from('avatars')
  const { error } = await storage.upload(avatarPath(user.id), photo, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (error) throw error
  // Same path every time, so the address changes with each upload to get past caches.
  await saveProfile({ avatar_url: `${storage.getPublicUrl(avatarPath(user.id)).data.publicUrl}?v=${Date.now()}` })
}

export async function removeAvatar() {
  const user = state.user
  if (!user) return
  await (await client()).storage.from('avatars').remove([avatarPath(user.id)])
  await saveProfile({ avatar_url: null })
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
