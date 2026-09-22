import { useDeferredValue, useState } from 'react'
import { ALBUMS, LADDER, formatDuration, type Song } from '../data/songs'
import { normalizeTitle } from '../lib/match'
import { Icon } from './Icon'

interface Props {
  level: number
  onJump: (level: number) => void
}

const TOTAL_HOURS = Math.round(LADDER.reduce((sum, song) => sum + song.seconds, 0) / 3600)

export function Setlist({ level, onJump }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const needle = normalizeTitle(useDeferredValue(query))

  // Collapsed, show the songs around your level: three behind, six ahead.
  const start = Math.max(1, Math.min(level - 3, LADDER.length - 9))
  const rows = LADDER.map((song, i) => ({ song, n: i + 1 })).filter(({ song, n }) =>
    needle ? normalizeTitle(`${song.title} ${ALBUMS[song.album].title}`).includes(needle) : expanded || (n >= start && n < start + 10),
  )

  return (
    <section className="section grid" aria-labelledby="setlist-heading">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="setlist-heading">The setlist</h2>
        <p className="label-meta narrow-only">{LADDER.length} songs</p>
        <p className="label-note">
          <span className="wide-only">{LADDER.length} songs, shortest to longest. </span>
          <span className="narrow-only">Shortest to longest, </span>
          {TOTAL_HOURS} hours in all.
        </p>
        <p className="label-note">Already doing the challenge? Pick your song to move your ladder there.</p>
      </div>
      <div className="section-body setlist-body">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Find a song</span>
          <input type="search" placeholder="Find a song or album" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="tracklist">
          <div className="tracklist-head" aria-hidden="true">
            <span className="track-no">No.</span>
            <span>Title</span>
            <span>Album</span>
            <span className="track-len">Length</span>
            <span />
          </div>
          <ol>
            {rows.map(({ song, n }) => (
              <Track key={song.id} song={song} n={n} level={level} onJump={onJump} />
            ))}
          </ol>
          {rows.length === 0 && <p className="tracklist-empty">No song matches “{query}”.</p>}
        </div>
        {!needle && (
          <button type="button" className="btn btn-secondary setlist-toggle" onClick={() => setExpanded((open) => !open)}>
            {expanded ? 'Show fewer' : `Show all ${LADDER.length} songs`}
          </button>
        )}
      </div>
    </section>
  )
}

function Track({ song, n, level, onJump }: { song: Song; n: number; level: number; onJump: (level: number) => void }) {
  const album = ALBUMS[song.album]
  const state = n < level ? 'done' : n === level ? 'current' : 'ahead'
  return (
    <li className={`track ${state}`}>
      <button
        type="button"
        className="track-btn"
        onClick={() => state !== 'current' && onJump(n)}
        aria-current={state === 'current' ? 'step' : undefined}
        aria-label={`Level ${n}: ${song.title}, ${formatDuration(song.seconds)}${state === 'done' ? ', done' : state === 'current' ? ', up next' : ''}`}
      >
        <span className="track-no">{n}</span>
        <span className="track-main">
          <span className="track-title">{song.title}</span>
          <span className="track-album">
            <span className="swatch" style={{ background: album.color }} />
            {album.short}
            {state === 'current' && <span className="up-next narrow-only"> · Up next</span>}
          </span>
        </span>
        <span className="track-end">
          <span className="track-len">{formatDuration(song.seconds)}</span>
          <span className="track-status">
            {state === 'done' && <Icon name="check" size={16} />}
            {state === 'current' && <span className="up-next wide-only">Up next</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
