import { formatDuration } from '../../data/songs'
import { togetherTime } from '../together'
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

/** The seconds each person planked in a round, as they report them. */
export interface RoundTime {
  round: number
  seconds: ReadonlyMap<string, number>
}

/** Keeps everyone's time once they've said it, so someone who then leaves the room still counts. A new round starts empty. */
export function timeThisRound(kept: RoundTime, round: number, members: readonly LiveMember[]): RoundTime {
  const seconds = new Map(kept.round === round ? kept.seconds : [])
  const changed = members.filter((m) => m.held !== undefined && seconds.get(m.id) !== m.held)
  changed.forEach((m) => seconds.set(m.id, m.held!))
  return kept.round === round && changed.length === 0 ? kept : { round, seconds }
}

/** Everyone's time added up, whoever stopped where: "11:32", or "2 hours 5 minutes" once it's long. */
export function roundTotal(time: RoundTime): string {
  const total = [...time.seconds.values()].reduce((sum, s) => sum + s, 0)
  return total < 3600 ? formatDuration(Math.round(total)) : togetherTime(total)
}

/** Where the room is, for someone watching: "1:12 of 2:59", paused, counting in, or stretching with `stretchLeft` seconds to go. */
export function roomProgress(phase: LivePhase, seconds: number, songSeconds: number, stretchLeft = 0): string {
  if (phase === 'stretch') return `Stretching first: the 3-2-1 in ${formatDuration(Math.ceil(stretchLeft))}`
  const where = `${formatDuration(Math.floor(seconds))} of ${formatDuration(songSeconds)}`
  if (phase === 'paused') return `Paused at ${where}`
  if (phase === 'countdown') return seconds < 1 ? 'Starting: 3, 2, 1…' : `Carrying on from ${where}`
  return where
}
