import { ALBUMS, SONGS, type Song } from '../../data/songs'
import { normalizeTitle } from '../match'

/** Songs matching what was typed, up to `limit`: titles first, then songs on a matching album. Nothing for an empty search. */
export function findSongs(query: string, limit = 8): Song[] {
  const needle = normalizeTitle(query)
  if (!needle) return []
  const byTitle = SONGS.filter((song) => normalizeTitle(song.title).includes(needle))
  const byAlbum = SONGS.filter((song) => !byTitle.includes(song) && normalizeTitle(ALBUMS[song.album].title).includes(needle))
  return [...byTitle, ...byAlbum].slice(0, limit)
}
