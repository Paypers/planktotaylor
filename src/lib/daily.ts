import { LAUNCH_SONGS, SONG_BY_ID, type Song } from '../data/songs'
import { daysBetween, type DayKey } from './dates'

/** Daily #1. Everyone on the same calendar date gets the same song, like Wordle. */
export const DAILY_EPOCH: DayKey = '2026-09-22'

/**
 * New releases, the song of the day on their release day once they're out. A premiere is slotted
 * in rather than taking a day from the rotation, which carries on unchanged the day after.
 */
export const PREMIERES: Readonly<Record<DayKey, string>> = {
  '2026-09-25': 'patient-zero',
}

export function dailyNumber(day: DayKey): number {
  return daysBetween(DAILY_EPOCH, day) + 1
}

function hashString(text: string): number {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Sorted by id rather than duration so that refreshing durations from YouTube
// never changes which song is "today's song".
const POOL = [...LAUNCH_SONGS].sort((a, b) => a.id.localeCompare(b.id))
const decks = new Map<number, Song[]>()

function deck(cycle: number): Song[] {
  let shuffled = decks.get(cycle)
  if (!shuffled) {
    const random = mulberry32(hashString(`plank-to-taylor:${cycle}`))
    shuffled = [...POOL]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    decks.set(cycle, shuffled)
  }
  return shuffled
}

const RELEASED_PREMIERES = new Map(
  Object.entries(PREMIERES).flatMap(([day, id]) => {
    const song = SONG_BY_ID.get(id)
    return song ? [[day, song] as const] : []
  }),
)

/**
 * The song of the day given which premieres are out (a parameter for tests). Rotation songs are
 * dealt from a shuffled deck, so every one comes up once before any repeats.
 */
export function songOfTheDay(day: DayKey, premieres: ReadonlyMap<DayKey, Song>): Song {
  const premiere = premieres.get(day)
  if (premiere) return premiere
  const offset = daysBetween(DAILY_EPOCH, day)
  const slotted = [...premieres.keys()].filter((p) => {
    const at = daysBetween(DAILY_EPOCH, p)
    return at >= 0 && at < offset
  }).length
  const index = offset - slotted
  const size = POOL.length
  const cycle = Math.floor(index / size)
  const position = ((index % size) + size) % size
  return deck(cycle)[position]
}

/** The global song of the day. */
export function dailySong(day: DayKey): Song {
  return songOfTheDay(day, RELEASED_PREMIERES)
}
