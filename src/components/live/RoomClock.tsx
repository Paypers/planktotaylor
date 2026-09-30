import { useEffect, useState } from 'react'
import type { Song } from '../../data/songs'
import type { LiveLink, LiveState } from '../../lib/live/link'
import { roomProgress } from '../../lib/live/view'

/** Where the room is in the song, for someone watching: ticking along while it plays. */
export function RoomClock({ link, state, song }: { link: LiveLink; state: LiveState; song: Song }) {
  const [seconds, setSeconds] = useState(() => link.position())
  useEffect(() => {
    setSeconds(link.position())
    if (state.phase !== 'running' && state.phase !== 'countdown') return
    const timer = setInterval(() => setSeconds(link.position()), 250)
    return () => clearInterval(timer)
  }, [link, state])
  return (
    <div className="live-clock">
      <p className="live-clock-text">{roomProgress(state.phase, seconds, song.seconds)}</p>
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
