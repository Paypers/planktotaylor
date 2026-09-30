import type { Song } from '../../data/songs'
import type { RoomLink } from '../../lib/live/channel'
import type { DayKey } from '../../lib/dates'
import type { LiveMember, LiveState, TogetherShare } from '../../lib/live/link'
import { unlockAudio } from '../../lib/sound'
import { Icon } from '../Icon'
import { RoomPeople } from './RoomPeople'

interface Props {
  link: RoomLink
  members: readonly LiveMember[]
  /** Everyone who held to the end, longest in the room first. */
  finishers: readonly LiveMember[]
  state: LiveState
  song: Song
  today: DayKey
  onShareTogether: (share: TogetherShare) => void
}

/** How the round went: everyone who held to the end, the room's share, and Start again. Never who stopped. */
export function RoundOver({ link, members, finishers, state, song, today, onShareTogether }: Props) {
  const over = state.phase === 'over'
  const count = finishers.length
  const headline =
    count > 1
      ? `${count} planked ${song.title} together`
      : count === 1
        ? `${finishers[0].id === link.me ? 'You' : finishers[0].name} planked ${song.title}`
        : "That's the round"
  const share = () => onShareTogether({ song, day: today, finishers: finishers.map((m) => m.name), pauses: state.pauses })
  const again = () => {
    unlockAudio()
    link.start()
  }

  return (
    <>
      <section className="section grid" aria-labelledby="live-over">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="live-over">{over ? 'This round' : 'You held to the end'}</h2>
          <p className="label-meta">Round {state.round}</p>
        </div>
        <div className="section-body live-results">
          <p className="live-headline">{headline}</p>
          {count > 0 && (
            <ul className="live-names">
              {finishers.map((m) => (
                <li key={m.id}>
                  <Icon name="check" size={16} />
                  <bdi>{m.name}</bdi>
                  {m.id === link.me && <span className="member-notes">you</span>}
                </li>
              ))}
            </ul>
          )}
          {over ? (
            <div className="button-row">
              {count > 0 && (
                <button type="button" className="btn btn-primary" onClick={share}>
                  Share together
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={again}>
                Start again
              </button>
            </div>
          ) : (
            <p className="fine">Some are still planking. Share it and start again once they're done.</p>
          )}
          {over && count === 0 && <p className="fine">Start again whenever everyone's ready.</p>}
        </div>
      </section>
      <RoomPeople members={members} me={link.me} />
    </>
  )
}
