import { useState } from 'react'
import { SONG_BY_ID } from '../../data/songs'
import { acceptGroupInvite, dismissInvite } from '../../lib/account'
import type { DayKey } from '../../lib/dates'
import { timeAgo, type FriendInvite } from '../../lib/friends'
import { refreshFriends } from '../../lib/myFriends'
import { refreshGroups } from '../../lib/myGroups'
import { groupRoute, navigate, togetherRoute } from '../../lib/route'
import { Avatar } from '../Avatar'
import { friendProblemText } from './FriendRow'

/** What an invite is for, in a line: "Ana invited you to plank to Peter". */
export function inviteLine(invite: FriendInvite): string {
  if (invite.kind === 'group') return `${invite.name} invited you to join ${invite.group_name}`
  const song = invite.song_id ? SONG_BY_ID.get(invite.song_id)?.title : undefined
  return `${invite.name} invited you to plank ${song ? `to ${song}` : 'together'}`
}

/** Join an invite: into the room, or into the group. A room's invite goes once it's been used. */
export function useJoinInvite(today: DayKey) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const join = (invite: FriendInvite) => {
    setError(null)
    if (invite.kind === 'room' && invite.room_code && invite.song_id) {
      void dismissInvite(invite.id)
        .catch(() => {})
        .then(() => refreshFriends())
      navigate(togetherRoute(invite.room_code, invite.song_id))
      return
    }
    setBusy(invite.id)
    acceptGroupInvite(invite.id, today)
      .then(async (joined) => {
        await Promise.all([refreshGroups(), refreshFriends()])
        navigate(groupRoute(joined.id))
      })
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(null))
  }
  const notNow = (invite: FriendInvite) => {
    setError(null)
    setBusy(invite.id)
    dismissInvite(invite.id)
      .then(() => refreshFriends())
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(null))
  }
  return { busy, error, join, notNow }
}

/** Invites from friends, newest first, each with Join and Not now. */
export function InviteList({ invites, today, compact = false }: { invites: readonly FriendInvite[]; today: DayKey; compact?: boolean }) {
  const { busy, error, join, notNow } = useJoinInvite(today)
  const at = Date.now()
  if (invites.length === 0) return null
  return (
    <div className={compact ? 'invite-list compact' : 'invite-list'}>
      <ul>
        {invites.map((invite) => (
          <li key={invite.id} className="invite-row">
            <Avatar name={invite.name} url={invite.avatar_url} size={compact ? 28 : 36} />
            <span className="invite-text">
              <span className="invite-line">{inviteLine(invite)}</span>
              <span className="member-notes">{timeAgo(invite.at, at)}</span>
            </span>
            <span className="invite-actions">
              <button type="button" className="btn btn-primary btn-small" disabled={busy === invite.id} onClick={() => join(invite)}>
                Join
              </button>
              <button
                type="button"
                className="btn btn-link btn-small"
                disabled={busy === invite.id}
                onClick={() => notNow(invite)}
                aria-label={`Not now: ${inviteLine(invite)}`}
              >
                Not now
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
