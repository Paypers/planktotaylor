import type { ReactNode } from 'react'
import { FriendError, GroupError } from '../../lib/account'
import { activityLine, friendStatus, FRIENDS_EACH, REQUESTS_A_DAY, REQUESTS_WAITING, type Friend, type FriendProblem, type FriendStatus } from '../../lib/friends'
import { Avatar } from '../Avatar'
import { problemOf as groupProblemOf } from '../Groups'
import { HeldMark, Icon } from '../Icon'

const PROBLEMS: Record<FriendProblem, string> = {
  'sign-in': 'Sign in first.',
  name: "Add your name first: it's how friends see you.",
  'not-found': 'Nobody has that friend code. Check it, or ask them for their friend link.',
  yourself: "That's your own code.",
  blocked: "You've blocked them. Unblock them first, under Blocked.",
  'too-many-friends': `One of you has ${FRIENDS_EACH} friends already, the most each.`,
  'too-many-waiting': `You have ${REQUESTS_WAITING} requests waiting, the most at once. Cancel some, or wait for answers.`,
  'too-many-today': `That's ${REQUESTS_A_DAY} requests today, the most a day. Try again tomorrow.`,
  'too-many-invites': "That's a lot of invites this hour. Try again later.",
  'not-in-group': "You're not in a group with them any more.",
  unavailable: "Couldn't reach the site just now. Try again in a moment.",
}

/** What to say when a friends call didn't work. */
export function friendProblemText(error: unknown): string {
  if (error instanceof GroupError) return groupProblemOf(error)
  return PROBLEMS[error instanceof FriendError ? error.problem : 'unavailable']
}

const STATUS_SAID: Record<FriendStatus, string> = { planking: 'planking now', online: 'online', offline: '' }

/** A photo with a dot on it: green while they're online, the signal colour while they plank. */
export function StatusAvatar({ name, url, size, status }: { name: string; url: string | null; size: number; status: FriendStatus }) {
  return (
    <span className="status-avatar">
      <Avatar name={name} url={url} size={size} />
      {status !== 'offline' && <span className={`status-dot is-${status}`} aria-hidden="true" />}
    </span>
  )
}

/** Today's song: the tick once they've planked it, green with no breaks. Nothing before. */
export function TodayMark({ friend }: { friend: Friend }) {
  if (!friend.planked_today) return <span className="member-today" />
  return (
    <span className="member-today done" title={friend.clean_today ? 'Planked today, no breaks' : 'Planked today'}>
      {friend.clean_today ? (
        <HeldMark label="Planked today, no breaks" />
      ) : (
        <span role="img" aria-label="Planked today">
          <Icon name="check" size={18} />
        </span>
      )}
    </span>
  )
}

/** A friend in a line: photo and status, name, what they're doing, and today's tick. Opens their card. */
export function FriendRow({ friend, now, onOpen }: { friend: Friend; now: number; onOpen: () => void }) {
  const status = friendStatus(friend)
  const activity = activityLine(friend, now)
  return (
    <li>
      <button type="button" className="friend-row" onClick={onOpen}>
        <StatusAvatar name={friend.name} url={friend.avatar_url} size={36} status={status} />
        <span className="member-text">
          <span className="member-name">{friend.name}</span>
          <span className="member-notes">
            {activity}
            {/* The dot says it for the eye; this, for screen readers, when the line says something else. */}
            {STATUS_SAID[status] && !activity.toLowerCase().startsWith(STATUS_SAID[status]) && (
              <span className="sr-only">, {STATUS_SAID[status]}</span>
            )}
          </span>
        </span>
        <TodayMark friend={friend} />
      </button>
    </li>
  )
}

/** Someone in a list of requests or blocks, with what can be done about it. */
export function PersonRow({ name, url, note, children }: { name: string; url: string | null; note?: string; children: ReactNode }) {
  return (
    <li className="member-row">
      <Avatar name={name} url={url} size={36} />
      <span className="member-text">
        <span className="member-name">{name}</span>
        {note && <span className="member-notes">{note}</span>}
      </span>
      <span className="person-actions">{children}</span>
    </li>
  )
}
