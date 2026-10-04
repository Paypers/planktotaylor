import { useEffect, useState } from 'react'
import type { Song } from '../../data/songs'
import type { LiveLink, LiveState } from '../../lib/live/link'
import { roomProgress } from '../../lib/live/view'

/** The stretch's seconds to go, while the room's stretching. */
const stretchLeft = (state: LiveState) => (state.stretchEnds === null ? 0 : Math.max(0, (state.stretchEnds - performance.now()) / 1000))

/** Where the room is in the song, for someone watching: ticking along while it plays, or while it stretches. */
export function RoomClock({ link, state, song }: { link: LiveLink; state: LiveState; song: Song }) {
  const [seconds, setSeconds] = useState(() => link.position())
  const [stretching, setStretching] = useState(() => stretchLeft(state))
  useEffect(() => {
    const read = () => {
      setSeconds(link.position())
      setStretching(stretchLeft(state))
    }
    read()
    if (state.phase !== 'running' && state.phase !== 'countdown' && state.phase !== 'stretch') return
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [link, state])
  return (
    <div className="live-clock">
      <p className="live-clock-text">{roomProgress(state.phase, seconds, song.seconds, stretching)}</p>
      <div
        className="bar bar-thin"
        role="progressbar"
        aria-label="Where the room is in the song"
        aria-valuemin={0}
        aria-valuemax={song.seconds}
        aria-valuenow={Math.floor(seconds)}
      >
        <span style={{ width: `${Math.min(100, (seconds / song.seconds) * 100)}%` }} />
      </div>
    </div>
  )
}
