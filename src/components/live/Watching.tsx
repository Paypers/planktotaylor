import type { Song } from '../../data/songs'
import type { LiveLink, LiveMember, LiveState } from '../../lib/live/link'
import { SongLine } from '../SongRow'
import { RoomClock } from './RoomClock'
import { RoomPeople } from './RoomPeople'

interface Props {
  link: LiveLink
  state: LiveState
  members: readonly LiveMember[]
  song: Song
}

/** A round that's on without this device: it arrived mid-round, or stepped out. It's in the next one. */
export function Watching({ link, state, members, song }: Props) {
  return (
    <>
      <section className="section grid" aria-labelledby="live-now">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="live-now">Planking now</h2>
          <p className="label-meta">Round {state.round}</p>
        </div>
        <div className="section-body live-lobby">
          <SongLine song={song} />
          <RoomClock link={link} state={state} song={song} />
          <p className="live-note">You'll be in the next round.</p>
        </div>
      </section>
      <RoomPeople members={members} me={link.me} showStatus />
    </>
  )
}
