import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useSyncExternalStore } from 'react'
import { realtimeClient } from '../account'
import { nextExpiry, plankersIn, plankingUntil } from './presence'

// Planking now, over Supabase Realtime: each group has a private channel, group-planking:<id>, that only its
// members can join (schema.sql). While a member's plank screen is on, their device says so in each of their
// groups, and the header, the group cards and the group's page show how many are. Nothing is stored:
// presence goes when the device does, and a plank that runs long stops counting by itself (presence.ts).

export interface PlankingNow {
  /** Members planking now, not counting you, for each group whose channel has been joined. */
  byGroup: ReadonlyMap<string, number>
  /** Everyone planking now across your groups, each once. */
  total: number
}

const EMPTY: PlankingNow = { byGroup: new Map(), total: 0 }
// A channel that wouldn't join (the rule isn't set up yet, the player left the group, no connection) waits this long.
const RETRY_MS = 60_000

interface Joined {
  channel: RealtimeChannel
  subscribed: boolean
  tracked: boolean
}

const joined = new Map<string, Joined>()
const retryAt = new Map<string, number>()
const listeners = new Set<() => void>()
let watched: readonly string[] = []
let me: string | null = null
/** While this device's plank screen is on: until when it counts as planking now. */
let until: number | null = null
let visible = typeof document === 'undefined' || document.visibilityState === 'visible'
let snapshot = EMPTY
let supabase: SupabaseClient | null = null
let loadingClient = false
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible'
    reconcile()
  })
}

/** Joins and leaves channels to match what's wanted, and tells them whether this device is planking. */
function reconcile() {
  // Watching only while the page is in view. A plank keeps its groups told either way.
  const wanted = new Set(me && (visible || until !== null) ? watched : [])
  for (const [id, entry] of joined) if (!wanted.has(id)) leave(id, entry)
  if (wanted.size > 0 && hasClient()) {
    const now = Date.now()
    for (const id of wanted) {
      const entry = joined.get(id)
      if (entry?.subscribed) tell(entry)
      else if (!entry && (retryAt.get(id) ?? 0) <= now) join(id)
    }
  }
  recount()
}

/** supabase-js loads on demand: once it has, everything wanted joins. */
function hasClient(): boolean {
  if (supabase) return true
  if (!loadingClient) {
    loadingClient = true
    void realtimeClient()
      .then((client) => {
        supabase = client
        reconcile()
      })
      .catch(() => {})
  }
  return false
}

function join(id: string) {
  if (!supabase || !me) return
  const channel = supabase.channel(`group-planking:${id}`, { config: { private: true, presence: { key: me } } })
  const entry: Joined = { channel, subscribed: false, tracked: false }
  joined.set(id, entry)
  channel
    .on('presence', { event: 'sync' }, () => joined.get(id) === entry && recount())
    .subscribe((status) => {
      if (joined.get(id) !== entry) return
      if (status === 'SUBSCRIBED') {
        entry.subscribed = true
        tell(entry)
        recount()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Realtime would keep trying straight away. Refused is refused for a while, so wait.
        retryAt.set(id, Date.now() + RETRY_MS)
        leave(id, entry)
        clearTimeout(retryTimer)
        retryTimer = setTimeout(reconcile, RETRY_MS + 100)
        recount()
      }
    })
}

function leave(id: string, entry: Joined) {
  joined.delete(id)
  void supabase?.removeChannel(entry.channel).catch(() => {})
}

function tell(entry: Joined) {
  if (until !== null && !entry.tracked) {
    entry.tracked = true
    void entry.channel.track({ until })
  } else if (until === null && entry.tracked) {
    entry.tracked = false
    void entry.channel.untrack()
  }
}

/** Counts again from every joined channel, and again when the next plank stops counting. */
function recount() {
  clearTimeout(expiryTimer)
  const now = Date.now()
  const byGroup = new Map<string, number>()
  const everyone = new Set<string>()
  const expiries: number[] = []
  for (const [id, entry] of joined) {
    if (!entry.subscribed) continue
    const state = entry.channel.presenceState() as Record<string, unknown[]>
    const plankers = plankersIn(state, me, now)
    byGroup.set(id, plankers.size)
    plankers.forEach((p) => everyone.add(p))
    const expiry = nextExpiry(state, now)
    if (expiry !== null) expiries.push(expiry)
  }
  if (expiries.length > 0) expiryTimer = setTimeout(recount, Math.min(...expiries) - now + 50)
  const next: PlankingNow = { byGroup, total: everyone.size }
  if (next.total === snapshot.total && sameCounts(next.byGroup, snapshot.byGroup)) return
  snapshot = next
  listeners.forEach((fn) => fn())
}

const sameCounts = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) =>
  a.size === b.size && [...a].every(([id, n]) => b.get(id) === n)

/** The signed-in player's groups, to watch and to tell. The header calls it, since it's always there. */
export function useWatchGroupsPlanking(groupIds: readonly string[], userId: string | null) {
  const key = groupIds.join(' ')
  useEffect(() => {
    watched = key ? key.split(' ') : []
    me = userId
    reconcile()
    return () => {
      watched = []
      reconcile()
    }
  }, [key, userId])
}

/** How many are planking now, in each of your groups and across them. */
export function usePlankingNow(): PlankingNow {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => snapshot,
  )
}

/** While the plank screen is on (`active`), this device counts as planking now in each of your groups. */
export function useTellGroupsImPlanking(active: boolean, songSeconds: number) {
  useEffect(() => {
    if (!active) return
    until = plankingUntil(songSeconds, Date.now())
    reconcile()
    return () => {
      until = null
      reconcile()
    }
  }, [active, songSeconds])
}
