import { ALBUMS, type Song } from '../../data/songs'
import { lyricsFrom, pickRecord, type LrclibRecord, type Lyrics } from './lrc'

// Lyrics are fetched from LRCLIB (lrclib.net) while they're shown, and never stored: not in the repo,
// the build, the browser or the account. They're community-made and unlicensed, so the site can
// turn them off for everyone at once (public/lyrics.json).

const API = 'https://lrclib.net/api'
const ARTIST = 'Taylor Swift'
// LRCLIB asks apps to say who they are. Browsers can't set User-Agent, so it takes this header instead.
const HEADERS = { 'Lrclib-Client': 'Plank to Taylor' }

/** The site-wide switch. Read before every plank, and off whenever it can't be read. */
export async function lyricsSwitchedOn(): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}lyrics.json`, { cache: 'no-store' })
    if (!response.ok) return false
    const body = (await response.json()) as { enabled?: unknown }
    return body.enabled === true
  } catch {
    return false
  }
}

// For this visit only, so a song planked twice asks once. A failed request is forgotten and asked again.
const found = new Map<string, Promise<Lyrics | null>>()

export function lyricsFor(song: Song): Promise<Lyrics | null> {
  const known = found.get(song.id)
  if (known) return known
  const asking = lookUp(song).catch(() => {
    found.delete(song.id)
    return null
  })
  found.set(song.id, asking)
  return asking
}

/** The exact recording first (title, album and length). Failing that, a search, kept to recordings the song's length. */
async function lookUp(song: Song): Promise<Lyrics | null> {
  const exact = (await ask('get', {
    track_name: song.title,
    artist_name: ARTIST,
    album_name: ALBUMS[song.album].title,
    duration: String(song.seconds),
  })) as LrclibRecord | null
  const fromExact = exact && lyricsFrom(exact)
  if (fromExact) return fromExact
  const results = await ask('search', { track_name: song.title, artist_name: ARTIST })
  const record = Array.isArray(results) ? pickRecord(results as LrclibRecord[], song.seconds) : null
  return record && lyricsFrom(record)
}

/** Null when LRCLIB has nothing (404). Throws when it can't be reached. */
async function ask(path: 'get' | 'search', params: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: HEADERS,
    referrerPolicy: 'no-referrer',
    credentials: 'omit',
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`LRCLIB said ${response.status}`)
  return response.json()
}
