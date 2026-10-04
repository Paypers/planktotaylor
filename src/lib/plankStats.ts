import { SONG_BY_ID, type Song } from '../data/songs'
import type { Attempt } from './attempts'
import { togetherTime } from './together'

// Your planks in numbers, for the profile, from the attempts on record. Only what you did: nothing here
// counts goes that ended early, or how often you took a break.

export interface PlankStats {
  /** Seconds planked over every go, finished or not: every second counts. */
  timePlanked: number
  /** Planks held to the end of the song. */
  finished: number
  /** Of those, held with no breaks. */
  noBreaks: number
  /** The longest and shortest songs held to the end. */
  longest: Song | null
  shortest: Song | null
  /** The longest stretch held without a break, on any go. */
  longestUnbroken: { song: Song; seconds: number } | null
  /** The song held to the end most often, once it's been more than once. The latest wins a tie. */
  mostPlanked: { song: Song; times: number } | null
}

/** The longest stretch between breaks on one go, or null when its breaks weren't timed (older records). */
export function unbrokenSeconds(attempt: Attempt): number | null {
  if (attempt.pauses === 0) return attempt.reached
  if (!attempt.breaks?.length) return null
  const marks = [0, ...attempt.breaks.map((b) => b.at), attempt.reached]
  return Math.max(...marks.slice(1).map((at, i) => at - marks[i]))
}

export function plankStats(attempts: readonly Attempt[]): PlankStats {
  const finished = attempts.filter((a) => a.outcome === 'finished' && SONG_BY_ID.has(a.songId))
  const songs = finished.map((a) => SONG_BY_ID.get(a.songId)!)
  const times = new Map<string, number>()
  const mostPlanked = songs.reduce<PlankStats['mostPlanked']>((best, song) => {
    const count = (times.get(song.id) ?? 0) + 1
    times.set(song.id, count)
    return count > 1 && count >= (best?.times ?? 0) ? { song, times: count } : best
  }, null)
  const longestUnbroken = attempts.reduce<PlankStats['longestUnbroken']>((best, a) => {
    const song = SONG_BY_ID.get(a.songId)
    const seconds = unbrokenSeconds(a)
    return song && seconds !== null && seconds > (best?.seconds ?? 0) ? { song, seconds } : best
  }, null)
  return {
    timePlanked: attempts.reduce((sum, a) => sum + a.reached, 0),
    finished: finished.length,
    noBreaks: finished.filter((a) => a.pauses === 0).length,
    longest: songs.reduce<Song | null>((best, s) => (!best || s.seconds > best.seconds ? s : best), null),
    shortest: songs.reduce<Song | null>((best, s) => (!best || s.seconds < best.seconds ? s : best), null),
    longestUnbroken,
    mostPlanked,
  }
}

/** "4 hours 12 minutes", or "Under a minute" to begin with. */
export const timePlankedLine = (seconds: number): string => (seconds < 60 ? 'Under a minute' : togetherTime(seconds))
