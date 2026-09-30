import { useState, type ReactNode } from 'react'
import type { Song } from '../../data/songs'
import { useLiveRoom } from '../../lib/live/channel'
import type { DayKey } from '../../lib/dates'
import type { LiveLink, TogetherShare } from '../../lib/live/link'
import { MAX_MEMBERS } from '../../lib/live/members'
import type { PlankSession } from '../PlankTimer'
import { RoomStage } from './RoomStage'

interface Props {
  code: string
  song: Song
  name: string
  today: DayKey
  renderPlank: (session: PlankSession, link: LiveLink, onClose: () => void) => ReactNode
  onShareTogether: (share: TogetherShare) => void
  onRetry: () => void
}

/** The connection to the room: joining, then the room itself. Once in, a dropped connection never takes the room away. */
export function LiveRoom({ code, song, name, onRetry, ...stage }: Props) {
  const { link, status } = useLiveRoom(code, { name, songSeconds: song.seconds })
  const [entered, setEntered] = useState(false)
  if (status === 'open' && !entered) setEntered(true)

  if (status === 'full') {
    return (
      <Note>
        This room is full: {MAX_MEMBERS} people are in it already. Make a room of your own with Plank together, on the home
        page.
      </Note>
    )
  }
  if (!entered || !link) {
    return status === 'error' ? (
      <Note>
        Couldn't reach the room. Check your connection, then try again.
        <span className="button-row live-retry">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </span>
      </Note>
    ) : (
      <div className="grid">
        <p className="page-note fine">Joining the room…</p>
      </div>
    )
  }
  return (
    <>
      {status !== 'open' && (
        <div className="grid">
          <p className="page-note live-status" role="status">
            {status === 'reconnecting' ? 'The connection dropped. Reconnecting…' : 'Lost the room.'}
            {status === 'error' && (
              <button type="button" className="btn btn-link" onClick={onRetry}>
                Join again
              </button>
            )}
          </p>
        </div>
      )}
      <RoomStage link={link} code={code} song={song} {...stage} />
    </>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="grid">
      <p className="page-note groups-lede">{children}</p>
    </div>
  )
}
