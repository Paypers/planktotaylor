import { useDeferredValue, useMemo, useState } from 'react'
import { ALBUMS, LADDER, formatDuration, type Song } from '../data/songs'
import { normalizeTitle } from '../lib/match'
import { ladderRecords, type Completion, type LevelRecord } from '../lib/progress'
import { ERAS, followLink, hashFor } from '../lib/route'
import { HeldMark, Icon } from './Icon'

interface Props {
  level: number
  completions: readonly Completion[]
  /** Opens a level's details. The ladder is climbed in order: nothing here moves it. */
  onOpen: (level: number) => void
}

/**
 * clean    held with no breaks
 * breaks   done, with breaks
 * passed   moved past without planking it
 * current  up next
 * ahead    still to come
 */
type TrackState = 'clean' | 'breaks' | 'passed' | 'current' | 'ahead'
type Filter = 'clean' | 'breaks' | 'todo'

const TOTAL_HOURS = Math.round(LADDER.reduce((sum, song) => sum + song.seconds, 0) / 3600)

function trackState(n: number, level: number, record: LevelRecord | undefined): TrackState {
  if (n === level) return 'current'
  if (record) return record.clean ? 'clean' : 'breaks'
  return n < level ? 'passed' : 'ahead'
}

const inFilter = (state: TrackState, filter: Filter) =>
  filter === 'clean' ? state === 'clean' : filter === 'breaks' ? state === 'breaks' : state !== 'clean' && state !== 'breaks'

export function Setlist({ level, completions, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<Filter | null>(null)
  const [query, setQuery] = useState('')
  const needle = normalizeTitle(useDeferredValue(query))

  const records = useMemo(() => ladderRecords(completions), [completions])
  const tracks = useMemo(
    () =>
      LADDER.map((song, i) => {
        const record = records.get(song.id)
        return { song, n: i + 1, record, state: trackState(i + 1, level, record) }
      }),
    [records, level],
  )
  const counts = {
    clean: tracks.filter((t) => t.state === 'clean').length,
    breaks: tracks.filter((t) => t.state === 'breaks').length,
    todo: tracks.filter((t) => inFilter(t.state, 'todo')).length,
  }

  // Collapsed, show the songs around your level: three behind, six ahead. A search or a filter shows every match.
  const start = Math.max(1, Math.min(level - 3, LADDER.length - 9))
  const rows = tracks.filter(({ song, n, state }) => {
    if (filter && !inFilter(state, filter)) return false
    if (needle) return normalizeTitle(`${song.title} ${ALBUMS[song.album].title}`).includes(needle)
    return filter || expanded || (n >= start && n < start + 10)
  })

  const filters: { id: Filter; label: string; mark: TrackState }[] = [
    { id: 'clean', label: 'No breaks', mark: 'clean' },
    { id: 'breaks', label: 'With breaks', mark: 'breaks' },
    { id: 'todo', label: 'Not yet', mark: 'passed' },
  ]

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
        <p className="label-note">Tap a song for its details. The ladder is climbed in order, one level at a time.</p>
        <p className="label-note">
          Every song you plank is stamped into its album:{' '}
          <a href={hashFor(ERAS)} onClick={(e) => followLink(e, ERAS)}>
            Collect the eras
          </a>
          .
        </p>
      </div>
      <div className="section-body setlist-body">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Find a song</span>
          <input type="search" placeholder="Find a song or album" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="level-filters" role="group" aria-label="Show levels">
          {filters.map(({ id, label, mark }) => (
            <button
              key={id}
              type="button"
              className="level-filter"
              aria-pressed={filter === id}
              onClick={() => setFilter((current) => (current === id ? null : id))}
            >
              <LevelMark state={mark} breaks={id === 'breaks' ? undefined : 0} />
              <span className="level-filter-label">{label}</span>
              <span className="level-filter-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="tracklist">
          <div className="tracklist-head" aria-hidden="true">
            <span className="track-no">No.</span>
            <span>Title</span>
            <span>Album</span>
            <span className="track-len">Length</span>
            <span />
          </div>
          <ol>
            {rows.map(({ song, n, record, state }) => (
              <Track key={song.id} song={song} n={n} state={state} breaks={record?.breaks ?? 0} onOpen={onOpen} />
            ))}
          </ol>
          {rows.length === 0 && (
            <p className="tracklist-empty">
              {needle ? `No song matches “${query}”.` : filter === 'clean' ? 'None held with no breaks yet.' : filter === 'breaks' ? 'No levels with breaks.' : 'Every level is done.'}
            </p>
          )}
        </div>
        {!needle && !filter && (
          <button type="button" className="btn btn-secondary setlist-toggle" onClick={() => setExpanded((open) => !open)}>
            {expanded ? 'Show fewer' : `Show all ${LADDER.length} songs`}
          </button>
        )}
      </div>
    </section>
  )
}

/** The status mark: a green tick, an orange count of breaks, or a faint dash for a level moved past. */
function LevelMark({ state, breaks }: { state: TrackState; breaks?: number }) {
  if (state === 'clean') return <HeldMark />
  if (state === 'breaks') {
    return (
      <span className="level-mark breaks" aria-hidden="true">
        {breaks || ''}
      </span>
    )
  }
  if (state === 'passed') return <span className="level-mark passed" aria-hidden="true" />
  return null
}

const STATE_LABEL: Record<TrackState, (breaks: number) => string> = {
  clean: () => ', held with no breaks',
  breaks: (breaks) => `, done with ${breaks} ${breaks === 1 ? 'break' : 'breaks'}`,
  passed: () => ', moved past',
  current: () => ', up next',
  ahead: () => '',
}

function Track({
  song,
  n,
  state,
  breaks,
  onOpen,
}: {
  song: Song
  n: number
  state: TrackState
  breaks: number
  onOpen: (level: number) => void
}) {
  const album = ALBUMS[song.album]
  return (
    <li className={`track ${state}`}>
      <button
        type="button"
        className="track-btn"
        onClick={() => onOpen(n)}
        aria-current={state === 'current' ? 'step' : undefined}
        aria-label={`Level ${n}: ${song.title}, ${formatDuration(song.seconds)}${STATE_LABEL[state](breaks)}`}
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
            {state === 'current' ? <span className="up-next wide-only">Up next</span> : <LevelMark state={state} breaks={breaks} />}
          </span>
        </span>
      </button>
    </li>
  )
}
