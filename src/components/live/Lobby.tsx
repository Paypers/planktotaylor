import type { Song } from '../../data/songs'
import type { RoomLink } from '../../lib/live/channel'
import type { LiveMember } from '../../lib/live/link'
import { unlockAudio } from '../../lib/sound'
import { SongLine } from '../SongRow'
import { RoomInvite } from './RoomInvite'
import { RoomPeople } from './RoomPeople'

interface Props {
  link: RoomLink
  members: readonly LiveMember[]
  code: string
  song: Song
}

/** Waiting to start: the song, who's here, and the link to bring more. Anyone can press Start. */
export function Lobby({ link, members, code, song }: Props) {
  const start = (stretch: boolean) => {
    unlockAudio()
    if (stretch) link.stretch()
    else link.start()
  }
  return (
    <>
      <section className="section grid" aria-labelledby="live-song">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="live-song">The song</h2>
          <p className="label-meta">Waiting to start</p>
        </div>
        <div className="section-body live-lobby">
          <SongLine song={song} />
          <p className="live-note">Anyone can pause for everyone. Only your own pauses count as your breaks.</p>
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => start(false)}>
              Start together
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => start(true)}>
              Stretch first
            </button>
          </div>
          <p className="fine">
            Everyone here gets a 3-2-1, and the song starts at the same moment for all of you. Stretch first adds a minute of
            gentle stretches together before it. Anyone can skip the stretch for themselves.
          </p>
        </div>
      </section>
      <RoomPeople members={members} me={link.me} />
      <RoomInvite code={code} song={song} />
    </>
  )
}
