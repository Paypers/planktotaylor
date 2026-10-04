import type { LiveMember, LiveState } from './link'
import type { Command, Snapshot, Sync } from './messages'

// The room's plank, worked out on each device from the commands everyone sends. Pure: times are this
// device's performance.now(), passed in, so the same commands settle the same way on every device.

/** The 3-2-1 before the song starts, or carries on after a pause. */
export const COUNTDOWN_MS = 3000
/** The stretch together before the 3-2-1, when whoever pressed Start chose one. */
export const STRETCH_MS = 60_000
/** How often the host sends its place in the song while planking. */
export const SYNC_EVERY_MS = 4000
// Further out than this, a device moves back into step with the host. Any closer, a jump would be worse.
const DRIFT_SECONDS = 1
// The round ends this long after the song does, even if someone's screen never said they'd finished.
const OVER_AFTER_SECONDS = 3

/** A command's place in the order: its number, then its sender. */
interface Stamp {
  seq: number
  from: string
}

interface Settled {
  state: LiveState
  last: Stamp
  /** When the room paused, on this device's clock. */
  pauseStart: number | null
  /** The round this device saw start. Someone who arrives mid-round watches it instead. */
  here: number | null
}

export interface Room extends Settled {
  /** The highest number seen, so this device's next command goes past it. */
  highest: number
  /** The room before the last command. A command pressed at the same moment that wins takes its place. */
  before: Settled | null
}

/** Stretch is a Start with the stretch first. */
export type Press = 'start' | 'stretch' | 'pause' | 'resume'

export const LOBBY: LiveState = { phase: 'lobby', at: 0, since: 0, stretchEnds: null, countdownEnds: null, pauses: [], round: 0 }

export const newRoom = (): Room => ({ state: LOBBY, last: { seq: 0, from: '' }, pauseStart: null, here: null, highest: 0, before: null })

/** Higher numbers come later. Two with the same number were pressed at once: the higher sender id wins. */
export function compareStamps(a: Stamp, b: Stamp): number {
  return a.seq - b.seq || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)
}

/** A stretch that has run out is the 3-2-1, and a 3-2-1 that has run out is running: from `at`, since the moment it ended. */
export function advance(state: LiveState, now: number): LiveState {
  const stretched = state.phase === 'stretch' && state.stretchEnds !== null && now >= state.stretchEnds
  const counting: LiveState = stretched ? { ...state, phase: 'countdown', stretchEnds: null } : state
  if (counting.phase !== 'countdown' || counting.countdownEnds === null || now < counting.countdownEnds) return counting
  return { ...counting, phase: 'running', since: counting.countdownEnds, countdownEnds: null }
}

export function tick(room: Room, now: number): Room {
  const state = advance(room.state, now)
  return state === room.state ? room : { ...room, state }
}

const songTime = (state: LiveState, now: number): number => {
  const current = advance(state, now)
  return current.phase === 'running' ? current.at + (now - current.since) / 1000 : current.at
}

/** Where the room is in the song, in seconds, kept within the song. */
export function position(state: LiveState, now: number, songSeconds = Infinity): number {
  return Math.min(Math.max(0, songTime(state, now)), songSeconds)
}

const withHighest = (room: Room, seq: number): Room => (seq > room.highest ? { ...room, highest: seq } : room)

const settled = ({ state, last, pauseStart, here }: Room): Settled => ({ state, last, pauseStart, here })

/** What a command does to the room, or null when it makes no sense now (a pause while paused, say). */
function step(base: Settled, command: Command, now: number, songSeconds: number): Settled | null {
  const state = advance(base.state, now)
  const last = { seq: command.seq, from: command.from }
  if (command.type === 'start') {
    if (command.round <= state.round) return null
    const stretchEnds = command.stretch ? now + STRETCH_MS : null
    const ends = (stretchEnds ?? now) + COUNTDOWN_MS
    return {
      state: { phase: stretchEnds === null ? 'countdown' : 'stretch', at: 0, since: ends, stretchEnds, countdownEnds: ends, pauses: [], round: command.round },
      last,
      pauseStart: null,
      here: command.round,
    }
  }
  const at = Math.min(command.at, songSeconds)
  if (command.type === 'pause') {
    if (state.phase !== 'running') return null
    return { ...base, state: { ...state, phase: 'paused', at, since: now, countdownEnds: null }, last, pauseStart: now }
  }
  if (state.phase !== 'paused') return null
  const ends = now + COUNTDOWN_MS
  // Rounded the way the plank screen rounds a break. The 3-2-1 back in is part of it.
  const pause = { at: Math.round(at * 10) / 10, ms: Math.round(ends - (base.pauseStart ?? now)) }
  return {
    ...base,
    state: { ...state, phase: 'countdown', at, since: ends, countdownEnds: ends, pauses: [...state.pauses, pause] },
    last,
    pauseStart: null,
  }
}

/** A command from anyone, this device's own included. Applied only if it comes after the last one applied. */
export function receive(room: Room, command: Command, now: number, songSeconds: number): Room {
  const later = compareStamps(command, room.last) > 0
  // Pressed at the same moment as the last one applied, and it wins: it's applied in that one's place.
  const base = !later ? null : command.seq === room.last.seq && room.before ? room.before : settled(room)
  const next = base && step(base, command, now, songSeconds)
  if (!next) return withHighest(room, command.seq)
  return { ...next, highest: Math.max(room.highest, command.seq), before: base }
}

/** This device's Start, Stretch, Pause or Continue: the room with it applied, and the command to send. Null when it does nothing now. */
export function press(room: Room, what: Press, me: string, now: number, songSeconds: number): { room: Room; command: Command } | null {
  const seq = room.highest + 1
  const state = advance(room.state, now)
  const starting = what === 'start' || what === 'stretch'
  // A Start from elsewhere is taken mid-round (they saw the round end first), but this device's own waits for it.
  if (starting && state.phase !== 'lobby' && state.phase !== 'over') return null
  const command: Command =
    starting
      ? { type: 'start', seq, from: me, round: state.round + 1, ...(what === 'stretch' ? { stretch: true as const } : {}) }
      : { type: what, seq, from: me, at: what === 'pause' ? position(state, now, songSeconds) : state.at }
  const next = receive(room, command, now, songSeconds)
  return next.last === room.last ? null : { room: next, command }
}

/** The host's place in the song: a device more than a second out moves back into step. Never a small nudge. */
export function resync(room: Room, sync: Sync, now: number): Room {
  const current = withHighest(tick(room, now), sync.seq)
  const out = current.state.phase === 'running' && sync.seq === room.last.seq && Math.abs(songTime(current.state, now) - sync.at) > DRIFT_SECONDS
  return out ? { ...current, state: { ...current.state, at: sync.at, since: now } } : current
}

/** The host has applied a command this device hasn't: time to ask where the room is. */
export const missedCommands = (room: Room, sync: Sync) => sync.seq > room.last.seq

/** What the host sends, where there's something to keep in step, or null. */
export function syncFor(room: Room, from: string, now: number, songSeconds: number): Sync | null {
  const state = advance(room.state, now)
  const at = songTime(state, now)
  return state.phase === 'running' && at < songSeconds ? { type: 'sync', seq: room.last.seq, from, at } : null
}

/** The room as this device has it, for someone who's just joined. */
export function snapshot(room: Room, from: string, now: number): Snapshot {
  const state = advance(room.state, now)
  return {
    type: 'state',
    from,
    seq: room.last.seq,
    by: room.last.from,
    phase: state.phase,
    at: songTime(state, now),
    stretchLeftMs: state.stretchEnds === null ? 0 : Math.min(STRETCH_MS, Math.max(0, state.stretchEnds - now)),
    countdownLeftMs: state.countdownEnds === null ? 0 : Math.min(COUNTDOWN_MS, Math.max(0, state.countdownEnds - now)),
    pausedMs: state.phase === 'paused' && room.pauseStart !== null ? Math.max(0, now - room.pauseStart) : 0,
    pauses: state.pauses,
    round: state.round,
  }
}

/**
 * The host's room, taken when it's further on than this device's: joining, or after missing a command. Arriving
 * during the stretch is in time for the round: nobody's planking yet.
 */
export function adopt(room: Room, snap: Snapshot, now: number): Room {
  const last = { seq: snap.seq, from: snap.by }
  if (compareStamps(last, room.last) <= 0) return withHighest(room, snap.seq)
  const { phase, at, pauses, round } = snap
  const stretchEnds = phase === 'stretch' ? now + snap.stretchLeftMs : null
  const ends = stretchEnds !== null ? stretchEnds + COUNTDOWN_MS : phase === 'countdown' ? now + snap.countdownLeftMs : null
  return {
    state: { phase, at, since: ends ?? now, stretchEnds, countdownEnds: ends, pauses, round },
    last,
    pauseStart: phase === 'paused' ? now - snap.pausedMs : null,
    here: phase === 'stretch' ? round : room.here,
    highest: Math.max(room.highest, snap.seq),
    before: null,
  }
}

/** Everyone in the round has finished or stepped out, or the song ended a while ago. */
export function roundIsOver(state: LiveState, members: readonly LiveMember[], now: number, songSeconds: number): boolean {
  if (state.phase === 'lobby' || state.phase === 'over') return false
  if (songTime(state, now) >= songSeconds + OVER_AFTER_SECONDS) return true
  // Anyone still in the lobby arrived mid-round, or their plank screen hasn't opened yet.
  const inRound = members.filter((m) => m.status !== 'lobby')
  return inRound.length > 0 && inRound.every((m) => m.status === 'done' || m.status === 'out')
}

/** The room now: a 3-2-1 that has run out is running, and a round everyone's through is over. */
export function settle(room: Room, members: readonly LiveMember[], now: number, songSeconds: number): Room {
  const current = tick(room, now)
  if (!roundIsOver(current.state, members, now, songSeconds)) return current
  const at = position(current.state, now, songSeconds)
  return { ...current, state: { ...current.state, phase: 'over', at, since: now, stretchEnds: null, countdownEnds: null }, pauseStart: null }
}
