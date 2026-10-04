import { useEffect, useRef } from 'react'
import { currentLineIndex, type Lyrics } from '../../lib/lyrics/lrc'

/** Where the line being sung sits in the box: a third of the way down, so what's next shows below it. */
const CURRENT_LINE_AT = 0.3

/** The words under the plank's buttons. Timed lyrics light the line being sung and scroll on with the song. */
export function PlankLyrics({ lyrics, seconds }: { lyrics: Lyrics; seconds: number }) {
  const list = useRef<HTMLOListElement>(null)
  const current = lyrics.kind === 'synced' ? currentLineIndex(lyrics.lines, seconds) : -1
  const lines = lyrics.kind === 'synced' ? lyrics.lines.map((line) => line.text) : lyrics.lines

  // Scrolling to each new line also brings the words back after a look further up or down.
  useEffect(() => {
    const box = list.current
    const line = box?.children[current]
    if (!box || !(line instanceof HTMLElement)) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top: line.offsetTop - box.clientHeight * CURRENT_LINE_AT, behavior: smooth ? 'smooth' : 'auto' })
  }, [current])

  return (
    <section className="plank-lyrics" aria-label="Lyrics">
      <ol ref={list} className={`lyrics-lines${lyrics.kind === 'synced' ? ' synced' : ''}`}>
        {lines.map((text, i) => (
          <li key={i} className={i === current ? 'current' : i < current ? 'past' : undefined} aria-current={i === current || undefined}>
            {text || '♪'}
          </li>
        ))}
      </ol>
      <p className="lyrics-credit">Lyrics: LRCLIB, a community-made database. Not licensed or checked by us; the words belong to their writers.</p>
    </section>
  )
}
