import { formatDuration, type Song } from '../data/songs'
import type { Pause } from './progress'

/** Squares that stand for the whole song in a shared result. */
export const BAR_BLOCKS = 10
const MAX_PAUSE_MARKS = 8

/**
 * The Wordle-style bar: ten green squares for the song, with an orange square dropped in
 * wherever you paused. A straight ten greens means you held it the whole way.
 */
export function plankBar(pauses: readonly Pause[], songSeconds: number): string {
  const sorted = [...pauses].sort((a, b) => a.at - b.at).slice(0, MAX_PAUSE_MARKS)
  let bar = ''
  for (let block = 0; block < BAR_BLOCKS; block++) {
    bar += '🟩'
    for (const pause of sorted) {
      const inBlock = Math.min(BAR_BLOCKS - 1, Math.floor((pause.at / songSeconds) * BAR_BLOCKS))
      if (inBlock === block) bar += '🟧'
    }
  }
  return bar
}

export function pausedSeconds(pauses: readonly Pause[]): number {
  return pauses.reduce((sum, p) => sum + p.ms, 0) / 1000
}

/** "2:54 plank, no breaks" or "2:54 plank · 2 pauses, 0:14 · 3:08 total". */
export function plankSummary(pauses: readonly Pause[], songSeconds: number): string {
  if (pauses.length === 0) return `${formatDuration(songSeconds)} plank, no breaks`
  const paused = pausedSeconds(pauses)
  const count = `${pauses.length} ${pauses.length === 1 ? 'pause' : 'pauses'}`
  return `${formatDuration(songSeconds)} plank · ${count}, ${formatDuration(paused)} · ${formatDuration(songSeconds + paused)} total`
}

export interface ShareInput {
  dailyNumber: number
  streak: number
  song: Song
  /** What this plank counted for. */
  daily: boolean
  level?: number
  pauses: readonly Pause[]
}

export function shareText({ dailyNumber, streak, song, daily, level, pauses }: ShareInput): string {
  const what =
    daily && level ? `Today's song + level ${level}` : daily ? "Today's song" : level ? `Level ${level}` : 'Extra credit'
  return [
    `Plank to Taylor #${dailyNumber}${streak > 0 ? ` 🔥${streak}` : ''}`,
    `${what} · ${song.title}`,
    plankBar(pauses, song.seconds),
    plankSummary(pauses, song.seconds),
    // The invite: most apps turn this into a preview card (see the og: tags in index.html).
    `Plank along: ${window.location.origin + import.meta.env.BASE_URL}`,
  ].join('\n')
}

export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      // Closing the share sheet isn't an error; anything else falls back to copying.
      if ((error as Error).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
