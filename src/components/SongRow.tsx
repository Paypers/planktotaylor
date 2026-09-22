import type { ReactNode } from 'react'
import { ALBUMS, formatDuration, type Song } from '../data/songs'
import { Icon } from './Icon'
import { Sleeve } from './Sleeve'

interface Props {
  eyebrow: string
  song: Song
  done: boolean
  /** Label of the Start button while the plank is still to do. */
  startLabel: string
  onStart: () => void
  onShare?: () => void
  onAgain?: () => void
  /** Extra lines under the album: progress, notes. */
  children?: ReactNode
}

/** One of today's planks, laid out like a tracklist row: sleeve, title, length, action. */
export function SongRow({ eyebrow, song, done, startLabel, onStart, onShare, onAgain, children }: Props) {
  const album = ALBUMS[song.album]
  return (
    <article className="song-row">
      <Sleeve album={album} size="lg" />
      <div className="row-text">
        <p className="row-eyebrow">
          {done && <Icon name="check" size={14} />}
          {done ? `${eyebrow} · done` : eyebrow}
        </p>
        <h3 className="row-title">{song.title}</h3>
        <p className="row-album">
          {album.title} ({album.year})
        </p>
        {children}
      </div>
      <span className="row-length">{formatDuration(song.seconds)}</span>
      <div className="row-actions">
        {done ? (
          <>
            {onShare && (
              <button type="button" className="btn btn-secondary" onClick={onShare}>
                Share
              </button>
            )}
            {onAgain && (
              <button type="button" className="btn btn-secondary" onClick={onAgain}>
                Plank again
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {startLabel}
          </button>
        )}
      </div>
    </article>
  )
}

/** A song on one line: sleeve, title over album, length. */
export function SongLine({ song }: { song: Song }) {
  const album = ALBUMS[song.album]
  return (
    <div className="song-line">
      <Sleeve album={album} size="sm" />
      <div className="song-line-text">
        <p className="song-line-title">{song.title}</p>
        <p className="song-line-album">
          {album.title} ({album.year})
        </p>
      </div>
      <span className="song-line-len">{formatDuration(song.seconds)}</span>
    </div>
  )
}

export function LadderProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="row-progress">
      <div className="bar bar-thin" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Ladder progress">
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <span className="meta">
        {done} of {total} done
      </span>
    </div>
  )
}
