import { formatDuration } from '../data/songs'
import type { Attempt } from './attempts'
import { SAME_PLANK_MS } from './planks'
import type { Completion, Pause } from './progress'
import { pauseLabel, pausedSeconds, plankSummary, stretchLabel, timelineParts, type TimelinePart } from './share'

// A plank's bar in the history and the calendar: to scale, held and paused, with words for each part.

/** One plank: the song, how far it got, and its breaks. */
export interface TimelineInput {
  /** The song's length. */
  seconds: number
  /** How far into the song it got: the whole song by default. */
  reached?: number
  /** Null when they weren't timed: attempts saved before they were. */
  breaks: readonly Pause[] | null
  /** How many there were, said when they weren't timed. */
  breakCount?: number
}

/** A part of the bar and its words: a title and a detail line to show, and both as one line to read out. */
export interface TimelineEntry extends TimelinePart {
  title: string
  detail: string
  label: string
}

export interface Timeline {
  parts: TimelineEntry[]
  /** The whole plank in a line. */
  summary: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * An attempt's breaks: saved with it, or for a finished one saved before they were, its record's. A later
 * go with no breaks can wipe a record's, so the record counts only with the same number. Null when unknown.
 */
export function attemptBreaks(attempt: Attempt, completions: readonly Completion[]): Pause[] | null {
  if (attempt.pauses === 0) return []
  if (attempt.breaks) return attempt.breaks
  if (attempt.outcome !== 'finished') return null
  const ended = Date.parse(attempt.endedAt)
  const record = completions.find(
    (c) => c.songId === attempt.songId && Math.abs(Date.parse(c.at) - ended) < SAME_PLANK_MS && (c.pauses?.length ?? 0) === attempt.pauses,
  )
  return record?.pauses ?? null
}

/**
 * The bar for a plank, part by part, with a line for the whole thing. Breaks that weren't timed make one
 * stretch up to where it got, saying how many there were.
 */
export function plankTimeline({ seconds, reached = seconds, breaks, breakCount = 0 }: TimelineInput): Timeline {
  const end = Math.min(reached, seconds)
  const untimed = breaks === null && breakCount > 0 ? `${plural(breakCount, 'break')}, not timed` : null
  // A stretch too short to show a second of (a break straight after the start, say) is left out.
  const parts = timelineParts(breaks ?? [], seconds, end).filter((p) => p.kind === 'pause' || Math.round(p.to) > Math.round(p.from))
  const entries = parts.map((part) => ({ ...part, ...words(part, parts.length === 1, untimed) }))
  return { parts: entries, summary: summary(breaks ?? [], seconds, end, untimed) }
}

/** How close to a thin part's centre a pointer still means it: half a comfortable tap. */
export const THIN_REACH = 8

/**
 * Which part a pointer at `x` means, from each part's edges. A part thinner than a tap wins near its
 * centre, even over the part it sits in, and between thin parts the nearest centre wins. Otherwise
 * it's the part under the pointer, or the nearest one across a gap.
 */
export function partAt(x: number, edges: readonly { left: number; right: number }[], reach = THIN_REACH): number | null {
  const fromCentre = (i: number) => Math.abs(x - (edges[i].left + edges[i].right) / 2)
  const outside = (i: number) => Math.max(edges[i].left - x, 0, x - edges[i].right)
  const all = edges.map((_, i) => i)
  const thin = all.filter((i) => edges[i].right - edges[i].left < 2 * reach && fromCentre(i) <= reach)
  const [pool, distance] = thin.length > 0 ? [thin, fromCentre] : [all, outside]
  return pool.reduce<number | null>((best, i) => (best === null || distance(i) < distance(best) ? i : best), null)
}

function words(part: TimelinePart, only: boolean, untimed: string | null): Pick<TimelineEntry, 'title' | 'detail' | 'label'> {
  if (part.kind === 'pause') {
    const title = `Paused ${pauseLabel(part.ms)}`
    const detail = Math.round(part.from) === 0 ? 'At the start' : `At ${formatDuration(part.from)}`
    return { title, detail, label: `${title}. ${detail}` }
  }
  if (part.kind === 'rest') {
    const title = `${stretchLabel(part.from, part.to)} to go`
    const detail = `Ended at ${formatDuration(part.from)}`
    return { title, detail, label: `${title}. ${detail}` }
  }
  const title = `Held ${stretchLabel(part.from, part.to)}`
  const note = untimed ?? (only ? 'The whole song, no breaks' : null)
  if (note) return { title, detail: note, label: `${title}. ${note}` }
  const from = formatDuration(part.from)
  const to = formatDuration(part.to)
  return { title, detail: `${from} – ${to}`, label: `${title}. From ${from} to ${to}` }
}

/** "2:54 plank, no breaks" held to the end; "Reached 1:12 of 3:45 · 2 pauses, 0:14" short of it. */
function summary(breaks: readonly Pause[], seconds: number, end: number, untimed: string | null): string {
  const reached = `Reached ${formatDuration(end)} of ${formatDuration(seconds)}`
  const finished = end >= seconds
  if (untimed) return `${finished ? `${formatDuration(seconds)} plank` : reached} · ${untimed}`
  if (finished) return plankSummary(breaks, seconds)
  if (breaks.length === 0) return `${reached}, no breaks`
  return `${reached} · ${plural(breaks.length, 'pause')}, ${formatDuration(pausedSeconds(breaks))}`
}
