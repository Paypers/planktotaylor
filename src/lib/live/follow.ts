import type { LivePhase, LiveState } from './link'

// Planking together: the room keeps the time, the plank screen's timer reads it, and the song follows.

/** The song this far out from the room, in seconds, gets moved back into step. */
export const DRIFT_SECONDS = 1.5
/** At most one move this often, so a slow connection doesn't keep cutting the song up. */
export const SEEK_GAP_MS = 4000
/** A pause from the player this soon after a move is the move settling, not someone pausing. */
export const SEEK_SETTLE_MS = 1000

/** The room's place in the song as the timer shows it: in ms, never before the start or past the end. */
export function roomMs(positionSeconds: number, songMs: number): number {
  return Math.min(songMs, Math.max(0, positionSeconds * 1000))
}

/** The 3, 2 or 1 to show until the room's countdown ends at `countdownEnds`: 0 once it has. */
export function countdownLeft(countdownEnds: number | null, now: number): number {
  if (countdownEnds === null) return 0
  return Math.min(3, Math.max(0, Math.ceil((countdownEnds - now) / 1000)))
}

/** Whether to move the song to where the room is: only when it's well out, and not straight after the last move. */
export function shouldSeek(videoSeconds: number | null, roomSeconds: number, now: number, lastSeek: number): boolean {
  if (videoSeconds === null) return false
  return Math.abs(videoSeconds - roomSeconds) > DRIFT_SECONDS && now - lastSeek >= SEEK_GAP_MS
}

/**
 * The video stopped on its own: a tap on it, or the phone pausing it. That's you pausing, as if you'd pressed
 * Pause, but only while you and the room are planking and it was really playing. Not a phone that never let it
 * start, the song stopped because you've finished or stepped out, or a move settling.
 */
export function videoPauseIsMine(room: LivePhase, planking: boolean, wasPlaying: boolean, sinceSeek: number): boolean {
  return room === 'running' && planking && wasPlaying && sinceSeek >= SEEK_SETTLE_MS
}

/** What the plank screen last followed. */
export interface Followed {
  phase: LivePhase
  round: number
}

/**
 * What the plank screen does when the room changes. `fresh` is a plank new to this screen: it's only just
 * opened, or someone started another round. Null when there's nothing to do: the room only put its clock
 * right, or it's between planks.
 */
export function roomStep(followed: Followed | null, room: LiveState): { to: 'countdown' | 'running' | 'paused'; fresh: boolean } | null {
  if (room.phase === 'lobby' || room.phase === 'over') return null
  const fresh = followed === null || followed.round !== room.round
  if (!fresh && followed.phase === room.phase) return null
  return { to: room.phase, fresh }
}
