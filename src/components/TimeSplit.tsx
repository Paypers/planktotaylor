import { useMemo, useState } from 'react'
import { formatTime, splitByAlbum, splitByKind, type Plank, type Slice } from '../lib/planks'

type View = 'kind' | 'album'

const SIZE = 168
const STROKE = 16
const RADIUS = (SIZE - STROKE - 8) / 2
const AROUND = 2 * Math.PI * RADIUS
/** The page's colour between slices, so neighbours read apart. */
const GAP = 2

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/**
 * Where the time went: a ring split by what the planks were for (today's song, the ladder, goes again)
 * or by album, with the total in the middle. Hovering, focusing or tapping a slice or its row shows
 * that slice in the middle instead; the rows list every value, so nothing needs the hover.
 */
export function TimeSplit({ planks }: { planks: Plank[] }) {
  const [view, setView] = useState<View>('kind')
  // Hovered (or focused) and tapped are kept apart: a tap arrives after the hover it causes, and
  // shouldn't undo it. Hover wins while it lasts; a tapped slice stays until tapped again.
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const active = hovered ?? pinned
  const slices = useMemo(() => (view === 'kind' ? splitByKind(planks) : splitByAlbum(planks)), [planks, view])
  if (planks.length === 0) return null

  const total = slices.reduce((sum, s) => sum + s.seconds, 0)
  const shown = slices.find((s) => s.key === active) ?? null
  const choose = (next: View) => {
    setView(next)
    setHovered(null)
    setPinned(null)
  }
  const toggle = (key: string) => {
    const unpin = pinned === key
    setPinned(unpin ? null : key)
    if (unpin) setHovered(null)
  }

  return (
    <section className="time-split" aria-labelledby="time-split-heading">
      <div className="time-split-head">
        <h3 id="time-split-heading">Time planked</h3>
        <div className="split-toggle" role="group" aria-label="Split the time by">
          <button type="button" aria-pressed={view === 'kind'} onClick={() => choose('kind')}>
            What for
          </button>
          <button type="button" aria-pressed={view === 'album'} onClick={() => choose('album')}>
            Album
          </button>
        </div>
      </div>

      <div className="time-split-body">
        <div className="ring">
          <Ring slices={slices} total={total} active={active} onHover={setHovered} onTap={toggle} />
          <div className="ring-middle" aria-live="polite">
            {shown ? (
              <>
                <span className="ring-value">{formatTime(shown.seconds)}</span>
                <span className="ring-label">
                  {Math.round((shown.seconds / total) * 100)}% · {shown.label}
                </span>
              </>
            ) : (
              <>
                <span className="ring-value">{formatTime(total)}</span>
                <span className="ring-label">{plural(planks.length, 'plank')}</span>
              </>
            )}
          </div>
        </div>

        <ul className="split-legend">
          {slices.map((slice) => (
            <li key={slice.key}>
              <button
                type="button"
                className={`split-row${active === slice.key ? ' active' : ''}`}
                aria-pressed={pinned === slice.key}
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(slice.key)}
                onBlur={() => setHovered(null)}
                onClick={() => toggle(slice.key)}
              >
                <span className="split-swatch" style={{ background: slice.color }} aria-hidden="true" />
                <span className="split-label">{slice.label}</span>
                <span className="split-count">{plural(slice.planks, 'plank')}</span>
                <span className="split-time">{formatTime(slice.seconds)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Ring({
  slices,
  total,
  active,
  onHover,
  onTap,
}: {
  slices: Slice[]
  total: number
  active: string | null
  onHover: (key: string | null) => void
  onTap: (key: string) => void
}) {
  const centre = SIZE / 2
  const whole = slices.length === 1
  let start = 0
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      {slices.map((slice) => {
        const share = (slice.seconds / total) * AROUND
        const length = whole ? AROUND : Math.max(1, share - GAP)
        const offset = whole ? 0 : start + GAP / 2
        start += share
        const lifted = active === slice.key
        return (
          <circle
            key={slice.key}
            cx={centre}
            cy={centre}
            r={RADIUS}
            fill="none"
            strokeWidth={lifted ? STROKE + 6 : STROKE}
            strokeDasharray={`${length} ${AROUND - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${centre} ${centre})`}
            style={{ stroke: slice.color, opacity: active && !lifted ? 0.35 : 1 }}
            className="ring-slice"
            onMouseEnter={() => onHover(slice.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onTap(slice.key)}
          />
        )
      })}
    </svg>
  )
}
