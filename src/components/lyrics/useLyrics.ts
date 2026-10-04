import { useEffect, useState } from 'react'
import type { Song } from '../../data/songs'
import type { Lyrics } from '../../lib/lyrics/lrc'
import { lyricsFor, lyricsSwitchedOn } from '../../lib/lyrics/lrclib'

/** The song's lyrics, when they're wanted and the site's switch is on. Null until then, and when there are none. */
export function useLyrics(song: Song, wanted: boolean): Lyrics | null {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  useEffect(() => {
    if (!wanted) return
    let current = true
    void lyricsSwitchedOn()
      .then((on) => (on ? lyricsFor(song) : null))
      .then((found) => current && setLyrics(found))
    return () => {
      current = false
    }
  }, [song, wanted])
  return wanted ? lyrics : null
}

/** Whether the site offers lyrics at all right now: null while it's being checked. */
export function useLyricsSwitch(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    let current = true
    void lyricsSwitchedOn().then((next) => current && setOn(next))
    return () => {
      current = false
    }
  }, [])
  return on
}
