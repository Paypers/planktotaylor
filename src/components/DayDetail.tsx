import { ALBUMS, formatDuration } from '../data/songs'
import { fromDayKey, type DayKey } from '../lib/dates'
import { songFor, type Completion } from '../lib/progress'
import { PlankTimeline } from './PlankTimeline'

interface Props {
  day: DayKey
  today: DayKey
  /** A freeze kept the streak going through it. */
  frozen: boolean
  planks: readonly Completion[]
}

/** The calendar's chosen day: each plank done that day, drawn to scale, or why there are none. */
export function DayDetail({ day, today, frozen, planks }: Props) {
  return (
    <div className="calendar-detail" aria-live="polite">
      <strong>{fromDayKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
      {frozen && <p>A freeze kept your streak going.</p>}
      {planks.length === 0 ? (
        !frozen && <p>{day === today ? 'Nothing yet today.' : 'Rest day.'}</p>
      ) : (
        planks.map((c) => {
          const planked = songFor(c)
          if (!planked) return null
          return (
            <div key={`${c.day}-${c.mode}-${c.songId}`}>
              <p>
                {c.mode === 'daily' ? "Today's song" : c.mode === 'ladder' ? `Level ${c.level}` : `${ALBUMS[planked.album].short} · new release`} ·{' '}
                {planked.title} · {formatDuration(c.seconds)}
                {c.xp ? ` · +${c.xp} XP` : ''}
              </p>
              <PlankTimeline seconds={c.seconds} breaks={c.pauses ?? []} />
            </div>
          )
        })
      )}
    </div>
  )
}
