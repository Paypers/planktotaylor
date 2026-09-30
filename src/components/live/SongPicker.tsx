import { useDeferredValue, useState } from 'react'
import type { Song } from '../../data/songs'
import { findSongs } from '../../lib/live/songSearch'
import { Icon } from '../Icon'
import { SongLine } from '../SongRow'

/** A search box and the songs it finds, to plank together instead of today's. */
export function SongPicker({ onPick }: { onPick: (song: Song) => void }) {
  const [query, setQuery] = useState('')
  const found = findSongs(useDeferredValue(query))
  return (
    <div className="song-pick">
      <label className="search">
        <Icon name="search" size={18} />
        <span className="sr-only">Find a song</span>
        <input type="search" placeholder="Find a song or album" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      </label>
      {found.length > 0 && (
        <ul className="song-pick-list">
          {found.map((song) => (
            <li key={song.id}>
              <button type="button" className="song-pick-item" onClick={() => onPick(song)}>
                <SongLine song={song} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== '' && found.length === 0 && <p className="fine">No song matches “{query}”.</p>}
    </div>
  )
}
