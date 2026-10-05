import { ALBUMS, LAUNCH_SONGS, SONG_BY_ID, formatDuration, type AlbumId, type Song } from '../data/songs'
import { addDays, daysBetween, type DayKey } from './dates'

/** Daily #1. Everyone on the same calendar date gets the same song, like Wordle. */
export const DAILY_EPOCH: DayKey = '2026-09-22'

/** Songs released together after launch: they premiere back to back, one a day from `from`, in this order. */
export interface Release {
  from: DayKey
  songs: readonly string[]
}

/**
 * New releases as the song of the day, from their release day. Their days are slotted in rather
 * than taken from the rotation, which carries on unchanged after them. A song that isn't out by its
 * day (not found on YouTube yet) leaves its day to a rotation song, and moves nothing else.
 * Collect the eras counts each release as one: its badge or charm needs all of its songs.
 */
export const RELEASES: readonly Release[] = [
  // The Life of a Showgirl: The Encore, out Friday 25 September: its four new songs, in track order.
  { from: '2026-09-25', songs: ['patient-zero', 'cleveland', 'pink-clouding', 'babylon'] },
]

/** Each premiere day's song. */
export const PREMIERES: Readonly<Record<DayKey, string>> = Object.fromEntries(
  RELEASES.flatMap((release) => release.songs.map((id, i) => [addDays(release.from, i), id])),
)

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

/**
 * From this day, today's song is picked by the picker below. Days before it keep the songs they had, from the
 * shuffled deck: a day that's been on screen never changes.
 */
export const PICKER_FROM: DayKey = '2026-10-12'

/**
 * All Too Well (10 Minute Version) isn't in the rotation: it gets a day of its own, All Too Well day, and that's
 * exceedingly rare. Never twice within RARE_GAP days; after that each day has a RARE_CHANCE of being the one,
 * and it comes by RARE_LATEST days at the latest (counted from the picker's first day, for the first one). That
 * makes it about once every year and a half, and nobody knows when.
 */
export const RARE_SONG_ID = 'all-too-well-10-minute-version'
export const RARE_GAP = 365
export const RARE_CHANCE = 1 / 150
export const RARE_LATEST = 900

/** A rotation song never comes back within this many days. */
export const REST_DAYS = 90
/** Nor from the same album as either of the last this many days' songs, so albums don't bunch up. */
export const ALBUM_SPACING = 2
/**
 * The longer a song's been away, the likelier it is: its chance goes with the square of the days since it was last
 * today's song, up to this many (and a song not had yet counts as this many). So every song comes round, at no fixed
 * interval and in no fixed order.
 */
const LONGEST_AWAY = 730

const ROTATION = POOL.filter((song) => song.id !== RARE_SONG_ID)

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

/** Every premiere day, with its song once it's out (null until then). */
const PREMIERE_SONGS: ReadonlyMap<DayKey, Song | null> = new Map(
  Object.entries(PREMIERES).map(([day, id]) => [day, SONG_BY_ID.get(id) ?? null]),
)

/**
 * The days before PICKER_FROM: the song of the day, given the premiere days (a parameter for tests). Rotation songs
 * are dealt from a shuffled deck, so every one comes up once before any repeats.
 */
export function deckSong(day: DayKey, premieres: ReadonlyMap<DayKey, Song | null>): Song {
  const premiere = premieres.get(day)
  if (premiere) return premiere
  const offset = daysBetween(DAILY_EPOCH, day)
  // Premiere days before this one, whether or not their song came out: none of them used up a rotation song.
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

/** A number from 0 to 1 for this day and purpose: the same everywhere, every time. */
const roll = (purpose: string, day: DayKey) => mulberry32(hashString(`plank-to-taylor:${purpose}:${day}`))()

/**
 * The rotation from PICKER_FROM: one song a day, each day's drawn by its own roll, from the songs that have rested
 * REST_DAYS and aren't from the last ALBUM_SPACING days' albums, the longest away likeliest. Every day draws one,
 * premiere days and All Too Well day included (which show their own song over it), so what a day draws never hangs
 * on whether a premiere came out in time. It picks up from the deck: songs the deck dealt just before rest too.
 */
const rotation: Song[] = []
const lastDrawn = new Map<string, number>()
let lastAlbums: AlbumId[] = []
let seeded = false

function seedRotation() {
  seeded = true
  const start = daysBetween(DAILY_EPOCH, PICKER_FROM)
  for (let at = 0; at < start; at++) {
    const song = deckSong(addDays(DAILY_EPOCH, at), PREMIERE_SONGS)
    if (song.id === RARE_SONG_ID || !ROTATION.includes(song)) continue
    lastDrawn.set(song.id, at)
    lastAlbums = [song.album, ...lastAlbums].slice(0, ALBUM_SPACING)
  }
}

function rotationSong(day: DayKey): Song {
  if (!seeded) seedRotation()
  const index = daysBetween(PICKER_FROM, day)
  while (rotation.length <= index) {
    const drawDay = addDays(PICKER_FROM, rotation.length)
    const at = daysBetween(DAILY_EPOCH, drawDay)
    const away = (song: Song) => {
      const last = lastDrawn.get(song.id)
      return last === undefined ? LONGEST_AWAY : Math.min(at - last, LONGEST_AWAY)
    }
    const rested = ROTATION.filter((song) => away(song) > REST_DAYS)
    // Nor from All Too Well day's album just before it, so the day comes fresh.
    const rareSoon = Array.from({ length: ALBUM_SPACING }, (_, k) => isRare(addDays(drawDay, k + 1), PREMIERE_SONGS)).some(Boolean)
    const avoid = rareSoon ? [...lastAlbums, SONG_BY_ID.get(RARE_SONG_ID)!.album] : lastAlbums
    const spaced = rested.filter((song) => !avoid.includes(song.album))
    const candidates = spaced.length > 0 ? spaced : rested
    const weights = candidates.map((song) => away(song) ** 2)
    let target = roll('pick', drawDay) * weights.reduce((sum, w) => sum + w, 0)
    let picked = candidates[candidates.length - 1]
    for (let i = 0; i < candidates.length; i++) {
      target -= weights[i]
      if (target < 0) {
        picked = candidates[i]
        break
      }
    }
    rotation.push(picked)
    lastDrawn.set(picked.id, at)
    // All Too Well day's album is the one that day showed, so the next days aren't from it either.
    const shown = isRare(drawDay, PREMIERE_SONGS) ? SONG_BY_ID.get(RARE_SONG_ID)! : picked
    lastAlbums = [shown.album, ...lastAlbums].slice(0, ALBUM_SPACING)
  }
  return rotation[index]
}

/**
 * All Too Well days from PICKER_FROM, given the premiere days (never one of them, out or not), up to as far as
 * anything has asked.
 */
const rareDays = new WeakMap<ReadonlyMap<DayKey, Song | null>, { through: number; days: number[] }>()

function isRare(day: DayKey, premieres: ReadonlyMap<DayKey, Song | null>): boolean {
  const offset = daysBetween(PICKER_FROM, day)
  if (offset < 0) return false
  let found = rareDays.get(premieres)
  if (!found) {
    found = { through: -1, days: [] }
    rareDays.set(premieres, found)
  }
  while (found.through < offset) {
    const at = found.through + 1
    const since = at - (found.days.at(-1) ?? 0)
    const ready = found.days.length === 0 || since >= RARE_GAP
    const drawDay = addDays(PICKER_FROM, at)
    if (ready && !premieres.has(drawDay) && (roll('rare', drawDay) < RARE_CHANCE || since >= RARE_LATEST)) found.days.push(at)
    found.through = at
  }
  return found.days.includes(offset)
}

/**
 * The song of the day, given the premiere days (a parameter for tests): a premiere, All Too Well day's song, or the
 * rotation's. Days before PICKER_FROM keep the deck's.
 */
export function songOfTheDay(day: DayKey, premieres: ReadonlyMap<DayKey, Song | null>): Song {
  if (day < PICKER_FROM) return deckSong(day, premieres)
  const premiere = premieres.get(day)
  if (premiere) return premiere
  if (isRare(day, premieres)) return SONG_BY_ID.get(RARE_SONG_ID)!
  return rotationSong(day)
}

/** The global song of the day. */
export function dailySong(day: DayKey): Song {
  return songOfTheDay(day, PREMIERE_SONGS)
}

/** Whether `day` is All Too Well day. */
export const isRareDay = (day: DayKey): boolean => dailySong(day).id === RARE_SONG_ID

/** The last All Too Well day before `day`, or null for none yet. Under the deck it was a day like any other. */
export function lastRareDay(day: DayKey): DayKey | null {
  for (let back = 1; ; back++) {
    const earlier = addDays(day, -back)
    if (earlier < PICKER_FROM) return null
    if (isRareDay(earlier)) return earlier
  }
}

/** One day's song, as the site publishes it in daily.json. */
export interface ScheduledSong {
  id: string
  title: string
  seconds: number
  /** "3:51" */
  length: string
  /** The album's full title. */
  album: string
  /** Daily No. */
  number: number
  /** The album's short name and colours, for the Discord cards. (A daily.json from before has none.) */
  short?: string
  color?: string
  ink?: string
}

/**
 * The song of the day for `count` days from `from`, published with every build as daily.json, so the
 * server (daily reminders, the Discord post) always names the same song as the site, new releases and all.
 */
export function dailySchedule(from: DayKey, count: number): Record<DayKey, ScheduledSong> {
  const days: Record<DayKey, ScheduledSong> = {}
  for (let i = 0; i < count; i++) {
    const day = addDays(from, i)
    const song = dailySong(day)
    days[day] = {
      id: song.id,
      title: song.title,
      seconds: song.seconds,
      length: formatDuration(song.seconds),
      album: ALBUMS[song.album].title,
      number: dailyNumber(day),
      short: ALBUMS[song.album].short,
      color: ALBUMS[song.album].color,
      ink: ALBUMS[song.album].ink,
    }
  }
  return days
}
