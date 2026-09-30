import type { Song } from '../../data/songs'
import type { DayKey } from '../dates'
import type { Pause } from '../progress'

// Planking together from a link: what the room, the plank screen and the room's share agree on.

/** How each person in the room is doing. Nothing else about them is shared: never their breaks. */
export type LiveStatus = 'lobby' | 'planking' | 'done' | 'out'

export interface LiveMember {
  /** Random, one per device and visit. */
  id: string
  name: string
  status: LiveStatus
  /** Epoch ms. The longest in the room is the host, who keeps everyone's clock in step. */
  joinedAt: number
}

/**
 * lobby      waiting for someone to press Start
 * countdown  3, 2, 1: before the song starts, or before it carries on after a pause
 * running    planking
 * paused     someone paused, so everyone has stopped
 * over       everyone has finished or stepped out. Start again goes back to countdown.
 */
export type LivePhase = 'lobby' | 'countdown' | 'running' | 'paused' | 'over'

/** The room's plank as this device sees it. Times are this device's `performance.now()`. */
export interface LiveState {
  phase: LivePhase
  /** Where the room is in the song, in seconds, as of `since`. */
  at: number
  since: number
  /** In countdown: when it ends and the song starts (or carries on) from `at`. */
  countdownEnds: number | null
  /** The breaks the room has taken this round, whoever paused. */
  pauses: Pause[]
  /** Goes up by one each Start. */
  round: number
}

/**
 * What the plank screen needs from the room while planking together. The getters return the same object
 * until something changes, so they work with `useSyncExternalStore(link.subscribe, link.getState)`.
 */
export interface LiveLink {
  /** This device's member id. */
  me: string
  getMembers: () => LiveMember[]
  getState: () => LiveState
  /** Where the room is in the song right now, in seconds: `at`, plus the time since `since` while running. */
  position: () => number
  /** Everyone's 3-2-1 begins, and the song starts from the top. */
  start: () => void
  /** Everyone stops where this device is now. The plank screen records the break itself: only for whoever pressed it. */
  pause: () => void
  /** Everyone gets a 3-2-1, then carries on from where the room paused. */
  resume: () => void
  setStatus: (status: LiveStatus) => void
  /** 'reconnecting' while this device has lost the room and is joining it again. Its plank carries on either way. */
  getConnection: () => 'open' | 'reconnecting'
  /** Called whenever the members, the state or the connection change. */
  subscribe: (listener: () => void) => () => void
}

/** A round planked together, as it gets shared. */
export interface TogetherShare {
  song: Song
  day: DayKey
  /** Everyone who held to the end, longest in the room first. Never who stopped. */
  finishers: string[]
  /** The room's breaks, whoever paused. */
  pauses: Pause[]
}
