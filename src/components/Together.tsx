import { formatDuration, type Song } from '../data/songs'
import { togetherTime, toughestStretch, type DailyStats } from '../lib/together'
import { HeldMark } from './Icon'

const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`

/**
 * How everyone did on today's song, once you've planked it. Friendly by design: a count of planks
 * held with no breaks (never a share of them), and breaks only as where the song gets tough.
 */
export function Together({ stats, song }: { stats: DailyStats; song: Song }) {
  const toughest = toughestStretch(stats, song.seconds)
  return (
    <div className="together">
      <p className="row-note">
        {people(stats.planks)} planked {song.title} today
      </p>
      {stats.seconds > 0 && <p className="row-note">Together: {togetherTime(stats.seconds)} of planking</p>}
      {stats.noBreak > 0 && (
        <p className="row-note together-held">
          <HeldMark />
          {stats.noBreak.toLocaleString()} held it all the way through
        </p>
      )}
      {toughest !== null && (
        <div className="together-tough">
          <HeatStrip slices={stats.slices} />
          <p className="row-note">Toughest stretch today: around {formatDuration(toughest)}</p>
        </div>
      )}
    </div>
  )
}

/** The song end to end, darker where breaks bunched up: how hard each part of it is. */
function HeatStrip({ slices }: { slices: number[] }) {
  const most = Math.max(...slices)
  return (
    <div className="heat" aria-hidden="true">
      {slices.map((breaks, i) => (
        <span key={i} style={{ opacity: breaks === 0 ? 0 : 0.12 + 0.6 * (breaks / most) }} />
      ))}
    </div>
  )
}
