// Lyrics as LRCLIB gives them, and the line to show at a point in the song.

export interface LyricLine {
  /** Seconds into the song. */
  at: number
  /** Empty for a break in the words. */
  text: string
}

/**
 * synced  timed lines: the current one is lit and the rest scroll past
 * plain   the words without times, for reading at your own pace
 */
export type Lyrics = { kind: 'synced'; lines: LyricLine[] } | { kind: 'plain'; lines: string[] }

/** One song as LRCLIB's API returns it. */
export interface LrclibRecord {
  trackName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

/** A recording more than this many seconds from the song's length is a different version, timed differently. */
export const MAX_LENGTH_GAP = 2

const STAMP = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g

/** "[01:02.50]Words" lines, in time order. A line can carry several times; tags like [ar:…] are skipped. */
export function parseLrc(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .flatMap((row) => {
      const stamps = [...row.matchAll(STAMP)]
      const words = row.replace(STAMP, '').trim()
      return stamps.map((stamp) => ({ at: Number(stamp[1]) * 60 + Number(stamp[2]), text: words }))
    })
    .sort((a, b) => a.at - b.at)
}

/** The line being sung `seconds` into the song: -1 before the first. */
export function currentLineIndex(lines: readonly LyricLine[], seconds: number): number {
  return lines.reduce((found, line, i) => (line.at <= seconds ? i : found), -1)
}

/** Timed lyrics where there are some, the plain words otherwise. Null for an instrumental or an empty record. */
export function lyricsFrom(record: LrclibRecord): Lyrics | null {
  if (record.instrumental) return null
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : []
  if (synced.some((line) => line.text)) return { kind: 'synced', lines: synced }
  const plain = record.plainLyrics?.split(/\r?\n/) ?? []
  return plain.some((line) => line.trim()) ? { kind: 'plain', lines: plain } : null
}

/** From search results: a recording the song's length, timed if any are, the closest in length first. */
export function pickRecord(records: readonly LrclibRecord[], seconds: number): LrclibRecord | null {
  const sameLength = records.filter((r) => Math.abs(r.duration - seconds) <= MAX_LENGTH_GAP && lyricsFrom(r))
  const ranked = [...sameLength].sort(
    (a, b) => Number(!a.syncedLyrics) - Number(!b.syncedLyrics) || Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds),
  )
  return ranked[0] ?? null
}
