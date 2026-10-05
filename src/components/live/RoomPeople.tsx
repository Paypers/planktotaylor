import { useAccount } from '../../lib/account'
import { useToday } from '../../lib/hooks'
import type { LiveMember } from '../../lib/live/link'
import { useMyFriends } from '../../lib/myFriends'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { RoomFriend } from './RoomFriend'

interface Props {
  members: readonly LiveMember[]
  me: string
  /** While a round is on: who's planking, and a tick for anyone done. Nothing ever marks who stopped. */
  showStatus?: boolean
}

/** Everyone in the room, longest in first. Signed in with a name, anyone else who is too can be added as a friend. */
export function RoomPeople({ members, me, showStatus = false }: Props) {
  const { user } = useAccount()
  const mine = useMyFriends(useToday()).now?.code
  const canAdd = user !== null && Boolean(mine)
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
              {canAdd && m.id !== me && m.friendCode && m.friendCode !== mine && <RoomFriend code={m.friendCode} />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
