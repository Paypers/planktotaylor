import { formatDuration } from '../data/songs'
import type { Pause } from '../lib/progress'
import { plankSummary } from '../lib/share'

interface Segment {
  kind: 'hold' | 'pause'
  ms: number
}

const pauseLabel = (ms: number) => (ms < 59_500 ? `${Math.round(ms / 1000)}s` : formatDuration(ms / 1000))

/**
 * The plank as it happened, to scale: green while you held, orange where you paused (the same
 * colours as the shared squares), each break as wide as it lasted and labelled with its length.
 */
export function PlankReceipt({ seconds, pauses }: { seconds: number; pauses: readonly Pause[] }) {
  const segments: Segment[] = []
  let cursor = 0
  for (const pause of [...pauses].sort((a, b) => a.at - b.at)) {
    const at = Math.min(pause.at, seconds)
    if (at > cursor) segments.push({ kind: 'hold', ms: (at - cursor) * 1000 })
    segments.push({ kind: 'pause', ms: pause.ms })
    cursor = at
  }
  if (seconds > cursor) segments.push({ kind: 'hold', ms: (seconds - cursor) * 1000 })

  return (
    <div className="receipt">
      <div className="receipt-bar" role="img" aria-label={plankSummary(pauses, seconds)}>
        {segments.map((segment, i) =>
          segment.kind === 'hold' ? (
            <span key={i} className="receipt-hold" style={{ flexGrow: segment.ms }} />
          ) : (
            <span key={i} className="receipt-pause" style={{ flexGrow: segment.ms }}>
              <span className="receipt-label">{pauseLabel(segment.ms)}</span>
            </span>
          ),
        )}
      </div>
      <p className="receipt-summary">{plankSummary(pauses, seconds)}</p>
    </div>
  )
}
