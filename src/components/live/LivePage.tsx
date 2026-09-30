import { useState, type ReactNode } from 'react'
import { SONG_BY_ID } from '../../data/songs'
import { accountsEnabled } from '../../lib/account'
import { dailySong } from '../../lib/daily'
import type { DayKey } from '../../lib/dates'
import type { LiveLink, TogetherShare } from '../../lib/live/link'
import { PageTop } from '../PageTop'
import type { PlankSession } from '../PlankTimer'
import { JoinRoom } from './JoinRoom'
import { LiveRoom } from './LiveRoom'

interface Props {
  code: string
  /** Null: today's song. */
  songId: string | null
  today: DayKey
  /** A signed-in player's name, or ''. */
  defaultName: string
  /** The plank screen, planking with the room. `onClose` is for when they close it. */
  renderPlank: (session: PlankSession, link: LiveLink, onClose: () => void) => ReactNode
  onShareTogether: (share: TogetherShare) => void
}

/** Planking together from a link: the name the room sees, then the room. */
export function LivePage({ code, songId, today, defaultName, renderPlank, onShareTogether }: Props) {
  // A link without a song means today's, as it was on arrival: it doesn't change at midnight mid-room.
  const [arrivedOn] = useState(today)
  const song = (songId && SONG_BY_ID.get(songId)) || dailySong(arrivedOn)
  const [name, setName] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  return (
    <div className="info-page live-page">
      <PageTop title="Plank together" />
      {!accountsEnabled ? (
        <div className="grid">
          <p className="page-note groups-lede">Planking together isn't set up on this site.</p>
        </div>
      ) : name === null ? (
        <JoinRoom song={song} defaultName={defaultName} onJoin={setName} />
      ) : (
        <LiveRoom
          key={tries}
          code={code}
          song={song}
          name={name}
          today={today}
          renderPlank={renderPlank}
          onShareTogether={onShareTogether}
          onRetry={() => setTries((n) => n + 1)}
        />
      )}
    </div>
  )
}
