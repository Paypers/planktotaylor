import type { DayKey } from '../../lib/dates'
import { friendStatus } from '../../lib/friends'
import { useMyFriends } from '../../lib/myFriends'
import { FRIENDS, followLink, hashFor } from '../../lib/route'
import { Icon } from '../Icon'

/**
 * Friends, in the header: how many are online, and a dot when a request or an invite is waiting. On a computer with the
 * friends rail showing, the rail does this instead (styles.css hides the button).
 */
export function FriendsLink({ today, current }: { today: DayKey; current: boolean }) {
  const { now } = useMyFriends(today)
  if (!now) return null
  const online = now.friends.filter((f) => friendStatus(f) !== 'offline').length
  const waiting = now.requests_in.length
  const invited = now.invites.length
  const said = [
    online > 0 && `${online} online`,
    invited > 0 && `${invited} ${invited === 1 ? 'invite' : 'invites'}`,
    waiting > 0 && `${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting`,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <a
      href={hashFor(FRIENDS)}
      className="icon-btn friends-link"
      onClick={(e) => followLink(e, FRIENDS)}
      aria-label={said ? `Friends: ${said}` : 'Friends'}
      aria-current={current ? 'page' : undefined}
    >
      <Icon name="smile" />
      {online > 0 && (
        <span className="online-badge" aria-hidden="true">
          {online}
        </span>
      )}
      {waiting + invited > 0 && <span className="request-dot" aria-hidden="true" />}
    </a>
  )
}
