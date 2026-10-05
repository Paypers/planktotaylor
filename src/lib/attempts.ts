import { useSyncExternalStore } from 'react'
import type { Pause } from './progress'

// Every plank attempt, from the moment the plank begins, finished or not. A record, not a score:
// nothing here moves the ladder, the streak or XP.

/** `era`: a new release, planked from its album page (Collect the eras). */
export type AttemptKind = 'daily' | 'ladder' | 'practice' | 'extra' | 'era'

/**
 * finished  held to the end of the song
 * gave-up   pressed Give up
 * stopped   closed the plank screen
 * left      the page went away mid-plank: closed, refreshed, or the phone shut it down
 * offline   the internet connection dropped
 */
export type AttemptOutcome = 'finished' | 'gave-up' | 'stopped' | 'left' | 'offline'

export interface Attempt {
  id: string
  songId: string
  kind: AttemptKind
  level?: number
  startedAt: string
  /** How far into the song it got, in seconds. */
  reached: number
  pauses: number
  /** Each break, where and how long. Absent with none, and on attempts saved before breaks were timed. */
  breaks?: Pause[]
  endedAt: string
  outcome: AttemptOutcome
  /** Saved to the account (signed-in players). */
  synced?: boolean
}

/** The attempt in progress: saved every couple of seconds, so an abandoned one still has its last position. */
interface LiveAttempt extends Omit<Attempt, 'endedAt' | 'outcome'> {
  seenAt: string
}

const LOG_KEY = 'plank-to-taylor:attempts'
const LIVE_KEY = 'plank-to-taylor:attempt-live'
/** When the account last sent this browser its attempts, by the account's clock. */
const SEEN_KEY = 'plank-to-taylor:attempts-seen'
/**
 * Kept in this browser: signed in, the account's whole history, from every device, up to this many (years of
 * planking), so every device shows the same numbers.
 */
export const ATTEMPTS_KEPT = 5000
/** A live attempt not saved for this long was abandoned (its tab closed, crashed or was put down). */
const STALE_MS = 15_000

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Private mode or full storage: the log just won't outlive the page.
    return false
  }
}

let log: Attempt[] = []
/** The log here is the one in storage: false after a write that failed. */
let stored = true
let seen: string | null = null
const listeners = new Set<() => void>()
const endedListeners = new Set<() => void>()

function commit(next: Attempt[]) {
  log = [...next].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-ATTEMPTS_KEPT)
  stored = write(LOG_KEY, log)
  listeners.forEach((fn) => fn())
}

/** An attempt left in progress by a page that's gone: it ended when it was last seen, and counts as left. */
function settleAbandoned() {
  const live = read<LiveAttempt | null>(LIVE_KEY, null)
  if (!live || Date.now() - Date.parse(live.seenAt) < STALE_MS) return
  write(LIVE_KEY, null)
  const { seenAt, ...rest } = live
  commit([...log, { ...rest, endedAt: seenAt, outcome: 'left' }])
  endedListeners.forEach((fn) => fn())
}

// On load: pick up the log, and close off any attempt a previous visit left hanging.
const kept = read<Attempt[]>(LOG_KEY, [])
log = Array.isArray(kept) ? kept : []
seen = read<string | null>(SEEN_KEY, null)
settleAbandoned()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LOG_KEY) {
      log = read<Attempt[]>(LOG_KEY, [])
      stored = true
      listeners.forEach((fn) => fn())
    }
    if (event.key === SEEN_KEY) seen = read<string | null>(SEEN_KEY, null)
  })
}

export function getAttempts(): Attempt[] {
  return log
}

export function useAttempts(): Attempt[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getAttempts,
  )
}

/** Fires whenever an attempt is written to the log, so the account can keep a copy. */
export function onAttemptEnded(fn: () => void): () => void {
  endedListeners.add(fn)
  return () => endedListeners.delete(fn)
}

/** The plank has begun: from here on, however it ends, it's on the record. */
export function beginAttempt(fields: { songId: string; kind: AttemptKind; level?: number }): string {
  settleAbandoned()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  write(LIVE_KEY, { id, ...fields, startedAt: now, reached: 0, pauses: 0, seenAt: now } satisfies LiveAttempt)
  return id
}

/** How many breaks, and each one when there were any, rounded as the timer rounds them. */
function breakFields(breaks: readonly Pause[]): Pick<Attempt, 'pauses' | 'breaks'> {
  if (breaks.length === 0) return { pauses: 0 }
  return { pauses: breaks.length, breaks: breaks.map((b) => ({ at: round(b.at), ms: Math.round(b.ms) })) }
}

/** Called every couple of seconds mid-plank, with the breaks so far (one still going included). */
export function saveAttemptProgress(id: string, reached: number, breaks: readonly Pause[]) {
  const live = read<LiveAttempt | null>(LIVE_KEY, null)
  if (live?.id !== id) return
  // The last save's breaks go: a break that turned out too short to count is no longer one.
  const { breaks: _last, ...rest } = live
  write(LIVE_KEY, { ...rest, reached: round(reached), ...breakFields(breaks), seenAt: new Date().toISOString() })
}

export function endAttempt(id: string, outcome: AttemptOutcome, reached: number, breaks: readonly Pause[]) {
  const live = read<LiveAttempt | null>(LIVE_KEY, null)
  if (live?.id !== id) return
  write(LIVE_KEY, null)
  const { seenAt: _seen, breaks: _last, ...rest } = live
  commit([...log, { ...rest, reached: round(reached), ...breakFields(breaks), endedAt: new Date().toISOString(), outcome }])
  endedListeners.forEach((fn) => fn())
}

/** When the account last sent this browser its attempts (`at` below), or null: then a sync asks for them all. */
export function attemptsSeen(): string | null {
  return seen
}

/**
 * Adds attempts from the account (another device's) and marks ones the account now has. `at`: these are all the
 * account had up to then, by its clock, so the next sync asks only for ones after.
 */
export function mergeAttempts(fromAccount: readonly Attempt[], savedIds: readonly string[] = [], at?: string) {
  const byId = new Map(log.map((a) => [a.id, a]))
  let changed = false
  // The account's copy wins, but one saved without its breaks keeps the ones timed here.
  for (const a of fromAccount) {
    const had = byId.get(a.id)
    const merged = { ...had, ...a, synced: true }
    if (had && JSON.stringify(had) === JSON.stringify(merged)) continue
    byId.set(a.id, merged)
    changed = true
  }
  for (const id of savedIds) {
    const a = byId.get(id)
    if (!a || a.synced) continue
    byId.set(id, { ...a, synced: true })
    changed = true
  }
  // Nothing new (most syncs): no write, and nothing on screen redraws.
  if (changed) commit([...byId.values()])
  // Only once they're in storage too: otherwise the next visit asks for them again.
  if (at && stored) {
    seen = at
    write(SEEN_KEY, at)
  }
}

/** A best shorter than this isn't worth a marker. */
const GHOST_MIN_SECONDS = 5

/**
 * Your ghost on a song you haven't finished: the furthest you got on a go you ended yourself (gave up
 * or stopped). Leaving and losing the connection weren't your choice, so they don't count. Null once
 * the song's finished (`finished`: there's a plank of it on record) or with nothing worth showing.
 */
export function ghostFor(songId: string, attempts: readonly Attempt[], finished: boolean): number | null {
  if (finished) return null
  let best = 0
  for (const a of attempts) {
    if (a.songId !== songId) continue
    if (a.outcome === 'finished') return null
    if (a.outcome === 'gave-up' || a.outcome === 'stopped') best = Math.max(best, a.reached)
  }
  return best >= GHOST_MIN_SECONDS ? best : null
}

/** Someone else signed in on this browser: the log here was the last account's, so it goes. */
export function forgetAttempts() {
  seen = null
  write(SEEN_KEY, null)
  commit([])
}

const round = (seconds: number) => Math.round(seconds * 10) / 10
