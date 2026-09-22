import type { Pause } from '../lib/progress'
import { pauseLabel, plankSegments, plankSummary } from '../lib/share'

/**
 * The plank as it happened, to scale: green while you held, orange where you paused (the same
 * colours as the shared squares), each break as wide as it lasted and labelled with its length.
 */
export function PlankReceipt({ seconds, pauses }: { seconds: number; pauses: readonly Pause[] }) {
  return (
    <div className="receipt">
      <div className="receipt-bar" role="img" aria-label={plankSummary(pauses, seconds)}>
        {plankSegments(pauses, seconds).map((segment, i) =>
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
