import type { LiveMember } from '../../lib/live/link'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'

interface Props {
  members: readonly LiveMember[]
  me: string
  /** While a round is on: who's planking, and a tick for anyone done. Nothing ever marks who stopped. */
  showStatus?: boolean
}

/** Everyone in the room, longest in first. */
export function RoomPeople({ members, me, showStatus = false }: Props) {
  return (
    <section className="section grid" aria-labelledby="live-people">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="live-people">Who's here</h2>
        <p className="label-meta">
          {members.length} {members.length === 1 ? 'person' : 'people'}
        </p>
      </div>
      <div className="section-body">
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <Avatar name={m.name} url={null} size={36} />
              <span className="member-text">
                <bdi className="member-name">{m.name}</bdi>
                {m.id === me && <span className="member-notes">you</span>}
              </span>
              {showStatus && m.status === 'planking' && <span className="member-today">Planking</span>}
              {showStatus && m.status === 'done' && (
                <span className="member-today done" role="img" aria-label="Held to the end" title="Held to the end">
                  <Icon name="check" size={18} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
