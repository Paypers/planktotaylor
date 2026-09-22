import { formatDuration, type Song } from '../data/songs'
import type { DayKey } from './dates'
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

export interface Segment {
  kind: 'hold' | 'pause'
  ms: number
}

/** The plank in order: stretches held, and the breaks between them (a break doesn't use up song). */
export function plankSegments(pauses: readonly Pause[], songSeconds: number): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const pause of [...pauses].sort((a, b) => a.at - b.at)) {
    const at = Math.min(pause.at, songSeconds)
    if (at > cursor) segments.push({ kind: 'hold', ms: (at - cursor) * 1000 })
    segments.push({ kind: 'pause', ms: pause.ms })
    cursor = at
  }
  if (songSeconds > cursor) segments.push({ kind: 'hold', ms: (songSeconds - cursor) * 1000 })
  return segments
}

/** "9s", or "1:05" for a long one. */
export const pauseLabel = (ms: number) => (ms < 59_500 ? `${Math.round(ms / 1000)}s` : formatDuration(ms / 1000))

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
  /** The day the plank was done. */
  day: DayKey
  streak: number
  song: Song
  /** What this plank counted for. */
  daily: boolean
  level?: number
  pauses: readonly Pause[]
  /** XP the plank earned (signed-in players only). */
  xp?: number
}

/** The finished screen's headline, also printed on the share card. */
export function plankHeadline(daily: boolean, level?: number): string {
  if (daily && level) return 'Two for one.'
  if (level) return `Level ${level} done.`
  if (daily) return "Today's song, done."
  return 'Extra credit.'
}

export const siteLink = () => window.location.origin + import.meta.env.BASE_URL

export function shareText({ dailyNumber, streak, song, daily, level, pauses, xp }: ShareInput): string {
  const what =
    daily && level ? `Today's song + level ${level}` : daily ? "Today's song" : level ? `Level ${level}` : 'Extra credit'
  return [
    `Plank to Taylor #${dailyNumber}${streak > 0 ? ` 🔥${streak}` : ''}`,
    `${what} · ${song.title}`,
    plankBar(pauses, song.seconds),
    plankSummary(pauses, song.seconds) + (xp ? ` · +${xp.toLocaleString()} XP` : ''),
    // The invite: most apps turn this into a preview card (see the og: tags in index.html).
    `Plank along: ${siteLink()}`,
  ].join('\n')
}
