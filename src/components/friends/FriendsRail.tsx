import { useState } from 'react'
import type { DayKey } from '../../lib/dates'
import { friendsInOrder, friendStatus, RAIL_FRIENDS, type Friend } from '../../lib/friends'
import { useMyFriends } from '../../lib/myFriends'
import { FRIENDS, followLink, friendsRoute, hashFor } from '../../lib/route'
import { Icon } from '../Icon'
import { FriendCard } from './FriendCard'
import { FriendRow } from './FriendRow'
import { InviteList } from './Invites'

/**
 * The friends rail, down the right of the page on a computer, like Discord's member list: requests waiting,
 * then up to 10 friends (planking now, online, then most recently seen), each opening their card. Narrower
 * screens don't show it (styles.css): the header's Friends button opens the friends page instead.
 */
export function FriendsRail({ today }: { today: DayKey }) {
  const { now } = useMyFriends(today)
  const [open, setOpen] = useState<Friend | null>(null)
  if (now === null) return null

  const friends = now ? friendsInOrder(now.friends) : []
  const online = friends.filter((f) => friendStatus(f) !== 'offline').length
  const waiting = now?.requests_in.length ?? 0
  const at = Date.now()
  // The card follows the list as it's checked in on.
  const shown = open ? (friends.find((f) => f.user_id === open.user_id) ?? null) : null

  return (
    <aside className="friends-rail" aria-labelledby="rail-heading">
      <div className="rail-head">
        <h2 id="rail-heading">
          <a href={hashFor(FRIENDS)} onClick={(e) => followLink(e, FRIENDS)}>
            Friends
          </a>
        </h2>
        {now && friends.length > 0 && <p className="label-meta">{online > 0 ? `${online} online` : 'None online'}</p>}
      </div>

      {now === undefined ? (
        <p className="fine">Loading…</p>
      ) : !now.code ? (
        <p className="rail-note">
          <a href={hashFor(FRIENDS)} onClick={(e) => followLink(e, FRIENDS)}>
            Choose a name
          </a>{' '}
          to add friends: it's how they see you.
        </p>
      ) : (
        <>
          <InviteList invites={now.invites} today={today} compact />
          {waiting > 0 && (
            <a className="rail-requests" href={hashFor(friendsRoute('pending'))} onClick={(e) => followLink(e, friendsRoute('pending'))}>
              <span className="friends-tab-badge" aria-hidden="true">
                {waiting}
              </span>
              <span>
                <span className="sr-only">{waiting} </span>
                {waiting === 1 ? 'friend request' : 'friend requests'}
              </span>
              <Icon name="right" size={16} />
            </a>
          )}
          {friends.length > 0 ? (
            <ul className="rail-list">
              {friends.slice(0, RAIL_FRIENDS).map((f) => (
                <FriendRow key={f.user_id} friend={f} now={at} onOpen={() => setOpen(f)} compact />
              ))}
            </ul>
          ) : (
            <p className="rail-note">No friends yet. Send someone your friend link, or add people from your groups.</p>
          )}
          <div className="rail-links">
            {friends.length > 0 && (
              <a href={hashFor(FRIENDS)} onClick={(e) => followLink(e, FRIENDS)}>
                {friends.length > RAIL_FRIENDS ? `All ${friends.length} friends` : 'All friends'}
              </a>
            )}
            <a href={hashFor(friendsRoute('add'))} onClick={(e) => followLink(e, friendsRoute('add'))} className="rail-add">
              <Icon name="user-plus" size={16} />
              Add a friend
            </a>
          </div>
        </>
      )}
      <FriendCard friend={shown} today={today} onClose={() => setOpen(null)} />
    </aside>
  )
}
