import type { LiveMember, LiveStatus } from './link'
import { STATUSES } from './messages'
import { cleanName } from './name'

// Who's in a room, from Realtime presence: each device's own say about itself.

/** A status, the round it's for, and how many times that device has changed its status. The higher `n` is the latest. */
export interface HeardStatus {
  status: LiveStatus
  round: number
  n: number
}

/** What a device tells the room about itself. */
export type Presence = LiveMember & HeardStatus

/** The most a room shows. Someone arriving after that finds it full. */
export const MAX_MEMBERS = 20

function readPresence(id: string, value: unknown): Presence | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const status = STATUSES.find((s) => s === p.status)
  const valid =
    status &&
    typeof p.name === 'string' &&
    typeof p.joinedAt === 'number' &&
    Number.isFinite(p.joinedAt) &&
    Number.isSafeInteger(p.round) &&
    (p.round as number) >= 0
  const n = Number.isSafeInteger(p.n) && (p.n as number) >= 0 ? (p.n as number) : 0
  return valid ? { id, name: p.name as string, status, joinedAt: p.joinedAt as number, round: p.round as number, n } : null
}

/**
 * Everyone in the channel's presence state (keyed by member id). A device that reconnected can show
 * twice for a moment: its latest is the one that counts.
 */
export function readPresences(state: Record<string, readonly unknown[]>): Presence[] {
  return Object.entries(state).flatMap(([id, metas]) => {
    const latest = readPresence(id, metas.at(-1))
    return latest ? [latest] : []
  })
}

/**
 * Each device's latest status. Presence only catches up every few seconds, so a status heard over broadcast
 * since wins until it does.
 */
export function withLatestStatus(presences: readonly Presence[], heard: ReadonlyMap<string, HeardStatus>): Presence[] {
  return presences.map((p) => {
    const news = heard.get(p.id)
    return news && news.n > p.n ? { ...p, status: news.status, round: news.round, n: news.n } : p
  })
}

/**
 * Everyone in presence, and anyone who dropped out of it but has spoken since, within `graceMs`: they're
 * joining again, and their presence follows. `known` is each device as presence last had it.
 */
export function withRejoining(
  presences: readonly Presence[],
  known: ReadonlyMap<string, Presence>,
  heardAt: ReadonlyMap<string, number>,
  now: number,
  graceMs: number,
): Presence[] {
  const here = new Set(presences.map((p) => p.id))
  const back = [...heardAt].flatMap(([id, at]) => {
    const last = known.get(id)
    return last && !here.has(id) && now - at < graceMs ? [last] : []
  })
  return [...presences, ...back]
}

// Longest in the room first. Ties go to the smaller id, the same way on every device.
const byArrival = (a: Presence, b: Presence) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Whoever has been in the room longest keeps everyone's clock in step, and tells newcomers where the room is. */
export function hostOf(presences: readonly Presence[]): string | null {
  return [...presences].sort(byArrival)[0]?.id ?? null
}

/** No room for this device: MAX_MEMBERS arrived before it. */
export function isFull(presences: readonly Presence[], me: string): boolean {
  const order = [...presences].sort(byArrival)
  const place = order.findIndex((p) => p.id === me)
  return place === -1 ? order.length >= MAX_MEMBERS : place >= MAX_MEMBERS
}

/** When this device joins: now, or just after everyone already here, so a clock running behind can't make it the host. */
export function joinTime(others: readonly Presence[], now: number): number {
  return Math.max(now, ...others.map((p) => p.joinedAt + 1))
}

/** The same people, showing the same way: nothing to redraw. */
export function sameMembers(a: readonly LiveMember[], b: readonly LiveMember[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m.id === b[i].id && m.name === b[i].name && m.status === b[i].status && m.joinedAt === b[i].joinedAt)
  )
}

/** Who's here as the room shows them, longest in first. A status from an earlier round shows as waiting. */
export function roomMembers(presences: readonly Presence[], round: number): LiveMember[] {
  return [...presences]
    .sort(byArrival)
    .slice(0, MAX_MEMBERS)
    .map((p) => ({ id: p.id, name: cleanName(p.name) || 'Someone', status: p.round < round ? 'lobby' : p.status, joinedAt: p.joinedAt }))
}
