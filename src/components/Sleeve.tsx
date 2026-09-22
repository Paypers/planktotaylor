import type { Album } from '../data/songs'

/** A square in the album's colour, standing in for its cover. Decorative: the album is named in text nearby. */
export function Sleeve({ album, size }: { album: Album; size: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`sleeve sleeve-${size}`} style={{ background: album.color, color: album.ink }} aria-hidden="true">
      <span>{album.short}</span>
    </div>
  )
}
