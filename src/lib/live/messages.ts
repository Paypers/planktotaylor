import type { Pause } from '../progress'
import type { LivePhase, LiveStatus } from './link'
import { COUNTDOWN_MS } from './room'

// What devices in a room send each other over Realtime broadcast. Anyone with the link can send
// anything, so everything that arrives is checked before it's used.

/** Start, Pause and Continue. `seq` is one past the highest number the sender has seen. */
export type Command =
  | { type: 'start'; seq: number; from: string; round: number }
  | { type: 'pause' | 'resume'; seq: number; from: string; at: number }

/** The host's place in the song, every few seconds while planking. `seq`: the last command it applied. */
export interface Sync {
  type: 'sync'
  seq: number
  from: string
  at: number
}

/** Sent on joining, and after missing something: the host answers with the room as it is. */
export interface Hello {
  type: 'hello'
  from: string
}

/** The room as the host has it. `seq` and `by` are the last command it applied. */
export interface Snapshot {
  type: 'state'
  from: string
  seq: number
  by: string
  phase: LivePhase
  at: number
  countdownLeftMs: number
  /** How long the room has been paused, while it is. */
  pausedMs: number
  pauses: Pause[]
  round: number
}

/**
 * A device's own status, sent the moment it changes (presence carries it too, but only every few seconds).
 * `n` counts the device's changes, so the latest wins however it arrives.
 */
export interface StatusNews {
  type: 'status'
  from: string
  status: LiveStatus
  round: number
  n: number
}

export type RoomMessage = Command | Sync | Hello | Snapshot | StatusNews

export const STATUSES: readonly LiveStatus[] = ['lobby', 'planking', 'done', 'out']

const PHASES: readonly LivePhase[] = ['lobby', 'countdown', 'running', 'paused', 'over']
const DAY_MS = 86_400_000
// schema.sql allows 100 breaks in a plank: a room never needs more.
const MAX_PAUSES = 100

const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{1,32}$/.test(value)
// Before anyone has pressed anything, the last command is nobody's.
const isStamp = (value: unknown): value is string => value === '' || isId(value)
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isUpTo = (value: unknown, most: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= most
const isPause = (value: unknown): value is Pause =>
  typeof value === 'object' && value !== null && isUpTo((value as Pause).at, DAY_MS / 1000) && isUpTo((value as Pause).ms, DAY_MS)

/** A message from another device, or null for anything that isn't one. Only the known fields are kept. */
export function readMessage(value: unknown): RoomMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const m = value as Record<string, unknown>
  if (!isId(m.from)) return null
  const from = m.from
  if (m.type === 'hello') return { type: 'hello', from }
  if (m.type === 'status') {
    const status = STATUSES.find((s) => s === m.status)
    return status && isCount(m.round) && isCount(m.n) ? { type: 'status', from, status, round: m.round, n: m.n } : null
  }
  if (!isCount(m.seq)) return null
  const seq = m.seq
  if (m.type === 'start') return isCount(m.round) ? { type: 'start', seq, from, round: m.round } : null
  if (!isUpTo(m.at, DAY_MS / 1000)) return null
  const at = m.at
  if (m.type === 'pause' || m.type === 'resume' || m.type === 'sync') return { type: m.type, seq, from, at }
  if (m.type !== 'state') return null
  const phase = PHASES.find((p) => p === m.phase)
  const pauses = Array.isArray(m.pauses) && m.pauses.length <= MAX_PAUSES && m.pauses.every(isPause) ? m.pauses : null
  if (!phase || !pauses || !isStamp(m.by) || !isCount(m.round) || !isUpTo(m.countdownLeftMs, COUNTDOWN_MS) || !isUpTo(m.pausedMs, DAY_MS)) return null
  return {
    type: 'state',
    from,
    seq,
    by: m.by,
    phase,
    at,
    countdownLeftMs: m.countdownLeftMs,
    pausedMs: m.pausedMs,
    pauses: pauses.map(({ at, ms }) => ({ at, ms })),
    round: m.round,
  }
}
