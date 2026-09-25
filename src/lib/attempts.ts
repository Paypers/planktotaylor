import { useSyncExternalStore } from 'react'

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
/** Kept in this browser; the account keeps them all. */
const KEEP = 300
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

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: the log just won't outlive the page.
  }
}

let log: Attempt[] = []
const listeners = new Set<() => void>()
const endedListeners = new Set<() => void>()

function commit(next: Attempt[]) {
  log = [...next].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-KEEP)
  write(LOG_KEY, log)
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
const stored = read<Attempt[]>(LOG_KEY, [])
log = Array.isArray(stored) ? stored : []
settleAbandoned()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LOG_KEY) {
      log = read<Attempt[]>(LOG_KEY, [])
      listeners.forEach((fn) => fn())
    }
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

/** Called every couple of seconds mid-plank. */
export function saveAttemptProgress(id: string, reached: number, pauses: number) {
  const live = read<LiveAttempt | null>(LIVE_KEY, null)
  if (live?.id !== id) return
  write(LIVE_KEY, { ...live, reached: round(reached), pauses, seenAt: new Date().toISOString() })
}

export function endAttempt(id: string, outcome: AttemptOutcome, reached: number, pauses: number) {
  const live = read<LiveAttempt | null>(LIVE_KEY, null)
  if (live?.id !== id) return
  write(LIVE_KEY, null)
  const { seenAt: _seen, ...rest } = live
  commit([...log, { ...rest, reached: round(reached), pauses, endedAt: new Date().toISOString(), outcome }])
  endedListeners.forEach((fn) => fn())
}

/** Adds attempts from the account (another device's) and marks ones the account now has. */
export function mergeAttempts(fromAccount: readonly Attempt[], savedIds: readonly string[] = []) {
  const byId = new Map(log.map((a) => [a.id, a]))
  for (const a of fromAccount) byId.set(a.id, { ...a, synced: true })
  for (const id of savedIds) {
    const a = byId.get(id)
    if (a) byId.set(id, { ...a, synced: true })
  }
  commit([...byId.values()])
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
  commit([])
}

const round = (seconds: number) => Math.round(seconds * 10) / 10
