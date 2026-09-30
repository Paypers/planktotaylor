import { formatDuration } from '../../data/songs'
import type { LiveMember, LivePhase, LiveStatus } from './link'
import { addFinishers } from './strip'

/**
 * lobby     waiting for someone to press Start
 * watching  a round is on without this device: it arrived mid-round, or stepped out
 * results   the round is over, or this device held to the end
 */
export type RoomView = 'lobby' | 'watching' | 'results'

/** What the room's page shows this device, under its plank screen when that's open. */
export function roomView(phase: LivePhase, mine: LiveStatus | undefined): RoomView {
  if (phase === 'lobby') return 'lobby'
  return phase === 'over' || mine === 'done' ? 'results' : 'watching'
}

/** Everyone who's held to the end of a round, longest in the room first. */
export interface Held {
  round: number
  members: readonly LiveMember[]
}

/** Keeps each finisher once they've finished, so someone who then leaves the room still counts. A new round starts empty. */
export function heldThisRound(held: Held, round: number, members: readonly LiveMember[]): Held {
  const kept = held.round === round ? held.members : []
  const listed = addFinishers(kept, members)
  return held.round === round && listed === held.members ? held : { round, members: listed }
}

/** Where the room is, for someone watching: "1:12 of 2:59", paused, or counting in. */
export function roomProgress(phase: LivePhase, seconds: number, songSeconds: number): string {
  const where = `${formatDuration(Math.floor(seconds))} of ${formatDuration(songSeconds)}`
  if (phase === 'paused') return `Paused at ${where}`
  if (phase === 'countdown') return seconds < 1 ? 'Starting: 3, 2, 1…' : `Carrying on from ${where}`
  return where
}
