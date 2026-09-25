import { ALBUMS, ALBUM_ORDER, SONG_BY_ID, type AlbumId, type Song } from '../data/songs'
import type { Attempt } from './attempts'
import { toDayKey, type DayKey } from './dates'
import type { Completion } from './progress'

// Every plank held to the end of the song, counted once: today's song, ladder climbs, new releases from
// their album page, and goes again (extra credit on today's song, practice on a climbed level, a new
// release again). The records only keep what counted for something, so goes again come from the
// attempt history.

/**
 * daily   today's song, the one that keeps the streak (a two-for-one counts here)
 * ladder  a ladder level climbed
 * era     a new release planked from its album page, for its stamp
 * again   planked again: today's song once it was done, a level already climbed, or a new release stamped already
 */
export type PlankKind = 'daily' | 'ladder' | 'era' | 'again'

export interface Plank {
  song: Song
  day: DayKey
  /** When it finished. */
  at: string
  seconds: number
  kind: PlankKind
  /** Held with no breaks. */
  clean: boolean
  lights: number
}

/** A go again that finished within this long of a record is that record (it counted after all). */
const SAME_PLANK_MS = 10_000

export function allPlanks(completions: readonly Completion[], attempts: readonly Attempt[]): Plank[] {
  const planks: Plank[] = []
  // A plank that counted for today's song and a ladder level is two records with the same time.
  const byTime = new Map<string, Completion[]>()
  for (const c of completions) byTime.set(c.at, [...(byTime.get(c.at) ?? []), c])
  for (const [at, records] of byTime) {
    const song = SONG_BY_ID.get(records[0].songId)
    if (!song) continue
    planks.push({
      song,
      day: records[0].day,
      at,
      seconds: records[0].seconds,
      kind: records.some((c) => c.mode === 'daily') ? 'daily' : records.some((c) => c.mode === 'ladder') ? 'ladder' : 'era',
      clean: records.every((c) => !c.pauses?.length),
      lights: records.reduce((sum, c) => sum + (c.lights ?? 0), 0),
    })
  }
  for (const a of attempts) {
    if (a.outcome !== 'finished' || (a.kind !== 'extra' && a.kind !== 'practice' && a.kind !== 'era')) continue
    const song = SONG_BY_ID.get(a.songId)
    if (!song) continue
    const ended = Date.parse(a.endedAt)
    const recorded = completions.some((c) => c.songId === a.songId && Math.abs(Date.parse(c.at) - ended) < SAME_PLANK_MS)
    if (recorded) continue
    planks.push({
      song,
      day: toDayKey(new Date(ended)),
      at: a.endedAt,
      seconds: song.seconds,
      kind: 'again',
      clean: a.pauses === 0,
      lights: 0,
    })
  }
  return planks.sort((x, y) => x.at.localeCompare(y.at))
}

/** One slice of the time planked: what it was, how many planks, how long. */
export interface Slice {
  key: string
  label: string
  planks: number
  seconds: number
  /** The slice's colour: a CSS colour or variable. */
  color: string
}

export const KIND_LABELS: Record<PlankKind, string> = { daily: "Today's song", ladder: 'Ladder', era: 'New releases', again: 'Planked again' }
const KIND_ORDER: PlankKind[] = ['daily', 'ladder', 'era', 'again']

/** Time by what the planks were for, always in the same order and colours. Kinds with none are left out. */
export function splitByKind(planks: readonly Plank[]): Slice[] {
  return KIND_ORDER.map((kind) => {
    const mine = planks.filter((p) => p.kind === kind)
    return { key: kind, label: KIND_LABELS[kind], planks: mine.length, seconds: sum(mine), color: `var(--chart-${kind})` }
  }).filter((s) => s.planks > 0)
}

/** Albums a ring shows before the rest fold into Other: more than this and slices get too thin to read. */
export const MOST_ALBUMS = 5

/** Time by album, most first, each in its own colour. Past the top few, the rest are Other. */
export function splitByAlbum(planks: readonly Plank[], most = MOST_ALBUMS): Slice[] {
  const albums = ALBUM_ORDER.map((id) => {
    const mine = planks.filter((p) => p.song.album === id)
    return { id, planks: mine.length, seconds: sum(mine) }
  })
    .filter((a) => a.planks > 0)
    .sort((a, b) => b.seconds - a.seconds)
  const slice = (a: { id: AlbumId; planks: number; seconds: number }): Slice => ({
    key: a.id,
    label: ALBUMS[a.id].title,
    planks: a.planks,
    seconds: a.seconds,
    color: ALBUMS[a.id].color,
  })
  if (albums.length <= most) return albums.map(slice)
  const rest = albums.slice(most - 1)
  return [
    ...albums.slice(0, most - 1).map(slice),
    {
      key: 'other',
      label: `${rest.length} more albums`,
      planks: rest.reduce((n, a) => n + a.planks, 0),
      seconds: rest.reduce((n, a) => n + a.seconds, 0),
      color: 'var(--faint)',
    },
  ]
}

const sum = (planks: readonly Plank[]) => planks.reduce((total, p) => total + p.seconds, 0)

/** "4 h 12 min", "38 min", "45 s". */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (seconds >= 60) return `${m} min`
  return `${Math.round(seconds)} s`
}
