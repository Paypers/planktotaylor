import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../data/songs'
import { STRETCH_MS } from '../../lib/live/room'
import { STRETCHES, stretchAt } from '../../lib/live/stretch'
import { sounds } from '../../lib/sound'

const leftOf = (ends: number) => Math.max(0, ends - performance.now())

interface Props {
  /** When the room's stretch ends, on this device's clock. */
  ends: number
  /** Stretching along. Skipping, it's just how long until the 3-2-1. */
  joining: boolean
  withSounds: boolean
  color: string
}

/**
 * The room's stretch on the plank screen, in place of the timer: the move everyone's on, its seconds left,
 * and what's next, all from the room's clock so every screen moves on together.
 */
export function StretchGuide({ ends, joining, withSounds, color }: Props) {
  const [left, setLeft] = useState(() => leftOf(ends))
  useEffect(() => {
    setLeft(leftOf(ends))
    const timer = setInterval(() => setLeft(leftOf(ends)), 250)
    return () => clearInterval(timer)
  }, [ends])

  const { stretch, index, secondsLeft } = stretchAt(left)
  // A soft note for each new move, heard with your head down. Not the first: the stretch has only just begun.
  const heard = useRef(index)
  useEffect(() => {
    if (index === heard.current) return
    heard.current = index
    if (withSounds && joining) sounds.stretch()
  }, [index, withSounds, joining])

  const untilCountdown = formatDuration(Math.ceil(left / 1000))
  const next = STRETCHES[index + 1]
  const clockLabel = joining ? `Stretch ${index + 1} of ${STRETCHES.length}` : 'The 3-2-1 in'
  const clockValue = joining ? formatDuration(secondsLeft) : untilCountdown
  return (
    <>
      <div className="plank-clock" role="timer" aria-label={`${clockLabel} ${clockValue}`}>
        <p className="plank-clock-label">{clockLabel}</p>
        <p className="plank-time">{clockValue}</p>
      </div>

      <div className="plank-progress">
        <div className="bar">
          <span style={{ width: `${(1 - left / STRETCH_MS) * 100}%`, background: color }} />
        </div>
        {joining && (
          <div className="plank-progress-times">
            <span>{next ? `Next: ${next.name}` : 'Then the 3-2-1'}</span>
            <span>3-2-1 in {untilCountdown}</span>
          </div>
        )}
      </div>

      <p className="plank-coach" aria-live="polite">
        {joining ? (
          <>
            {stretch.name}. <span className="stretch-how">{stretch.how}</span>
          </>
        ) : (
          "You're skipping the stretch. Your 3-2-1 comes with everyone's."
        )}
      </p>
    </>
  )
}
