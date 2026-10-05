import type { DayKey } from '../../lib/dates'
import { useMyFriends } from '../../lib/myFriends'
import { Avatar } from '../Avatar'
import { inviteLine, useJoinInvite } from './Invites'

/**
 * The newest invite from a friend, at the foot of the screen, wherever the friends rail isn't showing it (phones,
 * and pages without the rail). Join, or Not now: either way it goes.
 */
export function InviteToast({ today }: { today: DayKey }) {
  const { now } = useMyFriends(today)
  const { busy, error, join, notNow } = useJoinInvite(today)
  const invite = now?.invites[0]
  if (!invite) return null
  const more = (now?.invites.length ?? 1) - 1
  return (
    <div className="invite-toast" role="status" aria-live="polite">
      <Avatar name={invite.name} url={invite.avatar_url} size={32} />
      <p className="invite-toast-text">
        {inviteLine(invite)}
        {more > 0 && <span className="member-notes"> · {more} more in your friends list</span>}
        {error && <span className="error"> {error}</span>}
      </p>
      <span className="invite-actions">
        <button type="button" className="btn btn-primary btn-small" disabled={busy === invite.id} onClick={() => join(invite)}>
          Join
        </button>
        <button type="button" className="btn btn-link btn-small" disabled={busy === invite.id} onClick={() => notNow(invite)}>
          Not now
        </button>
      </span>
    </div>
  )
}
