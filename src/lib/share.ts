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

/** A stretch of a plank. `rest`: the part of the song it didn't reach. */
export interface TimelinePart {
  kind: 'hold' | 'pause' | 'rest'
  /** Seconds into the song. A pause starts and ends at the same point. */
  from: number
  to: number
  /** Song time for a hold or the rest, real time for a pause. */
  ms: number
}

/**
 * The plank in order up to where it got: stretches held and the breaks between them (a break doesn't
 * use up song), then the rest of the song if it stopped short. A break past `reached` sits at it.
 */
export function timelineParts(pauses: readonly Pause[], songSeconds: number, reached = songSeconds): TimelinePart[] {
  const end = Math.min(reached, songSeconds)
  const breaks = [...pauses].sort((a, b) => a.at - b.at).map((p) => ({ at: Math.min(p.at, end), ms: p.ms }))
  const held = (from: number, to: number): TimelinePart[] => (to > from ? [{ kind: 'hold', from, to, ms: (to - from) * 1000 }] : [])
  const rest: TimelinePart[] = songSeconds > end ? [{ kind: 'rest', from: end, to: songSeconds, ms: (songSeconds - end) * 1000 }] : []
  return [
    ...breaks.flatMap((pause, i): TimelinePart[] => [
      ...held(breaks[i - 1]?.at ?? 0, pause.at),
      { kind: 'pause', from: pause.at, to: pause.at, ms: pause.ms },
    ]),
    ...held(breaks.at(-1)?.at ?? 0, end),
    ...rest,
  ]
}

/** The plank in order: stretches held, and the breaks between them (a break doesn't use up song). */
export function plankSegments(pauses: readonly Pause[], songSeconds: number): Segment[] {
  // Held to the end of the song, so there's no rest.
  return timelineParts(pauses, songSeconds).map(({ kind, ms }) => ({ kind: kind === 'pause' ? 'pause' : 'hold', ms }))
}

/** "9s", or "1:05" for a long one. */
export const pauseLabel = (ms: number) => (ms < 59_500 ? `${Math.round(ms / 1000)}s` : formatDuration(ms / 1000))

/** "1:12" of song between two points, rounded the way each point is shown, so the stretches add up to the song. */
export const stretchLabel = (from: number, to: number) => formatDuration(Math.round(to) - Math.round(from))

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
  /** A new release planked from its album page: the release's name (Collect the eras). */
  release?: string
  pauses: readonly Pause[]
  /** XP the plank earned (signed-in players only). */
  xp?: number
  /** Aurora lights caught. Only lights caught are ever shown: never the ones missed. */
  lights?: number
  /** Planked together from a link: how many were in the round, you included. */
  together?: number
}

/** "Planked together · 4 of us", for a plank done with others. */
export const togetherLine = (together: number) => `Planked together · ${together} of us`

/** The finished screen's headline, also printed on the share card. */
export function plankHeadline(daily: boolean, level?: number, release?: string): string {
  if (daily && level) return 'Two for one.'
  if (level) return `Level ${level} done.`
  if (daily) return "Today's song, done."
  if (release) return 'Collected.'
  return 'Extra credit.'
}

export const siteLink = () => window.location.origin + import.meta.env.BASE_URL

export function shareText({ dailyNumber, streak, song, daily, level, release, pauses, xp, lights, together }: ShareInput): string {
  const what =
    daily && level
      ? `Today's song + level ${level}`
      : daily
        ? "Today's song"
        : level
          ? `Level ${level}`
          : release
            ? `New release: ${release}`
            : 'Extra credit'
  return [
    `Plank to Taylor #${dailyNumber}${streak > 0 ? ` 🔥${streak}` : ''}`,
    `${what} · ${song.title}`,
    ...(together ? [togetherLine(together)] : []),
    plankBar(pauses, song.seconds),
    plankSummary(pauses, song.seconds) + (xp ? ` · +${xp.toLocaleString()} XP` : '') + (lights ? ` · ✨ ${lights}` : ''),
    // The invite: most apps turn this into a preview card (see the og: tags in index.html).
    `Plank along: ${siteLink()}`,
  ].join('\n')
}
