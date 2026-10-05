import { useState } from 'react'
import type { DayKey } from '../../lib/dates'
import { activityLine, friendsInOrder, friendStatus, type Friend } from '../../lib/friends'
import { nudgeFriends } from '../../lib/friendInbox'
import { useMyFriends } from '../../lib/myFriends'
import { Dialog } from '../Dialog'
import { friendProblemText, StatusAvatar } from './FriendRow'

interface Props {
  open: boolean
  title: string
  /** What the invite is for, under the title. */
  about: string
  /** The friends who can be invited: online first. */
  friends: readonly Friend[]
  /** Sends the invites, and says how many went. */
  send: (to: string[]) => Promise<number>
  onClose: () => void
}

/** Picks friends to invite into a room or a group, and sends the invites. Each friend's site hears straight away. */
export function InviteFriendsDialog({ open, title, about, friends, send, onClose }: Props) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <Picker about={about} friends={friends} send={send} onClose={onClose} />
    </Dialog>
  )
}

function Picker({ about, friends, send, onClose }: Omit<Props, 'open' | 'title'>) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const at = Date.now()
  const ordered = friendsInOrder(friends)

  const toggle = (id: string) =>
    setChosen((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const go = () => {
    const to = [...chosen]
    setBusy(true)
    setError(null)
    send(to)
      .then((count) => {
        setSent(count)
        void nudgeFriends(to)
      })
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(false))
  }

  if (sent !== null) {
    return (
      <div className="invite-picker">
        <p role="status">{sent === 0 ? 'Nobody new to invite.' : `Invited ${sent} ${sent === 1 ? 'friend' : 'friends'}. They'll see it in their friends list.`}</p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-picker">
      <p className="fine">{about}</p>
      {ordered.length === 0 ? (
        <p className="groups-lede">No friends to invite here yet.</p>
      ) : (
        <ul className="member-list invite-choices">
          {ordered.map((f) => (
            <li key={f.user_id}>
              <label className="invite-choice">
                <input type="checkbox" checked={chosen.has(f.user_id)} onChange={() => toggle(f.user_id)} />
                <StatusAvatar name={f.name} url={f.avatar_url} size={32} status={friendStatus(f)} />
                <span className="member-text">
                  <span className="member-name">{f.name}</span>
                  <span className="member-notes">{activityLine(f, at)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={busy || chosen.size === 0} onClick={go}>
          {busy ? 'Inviting…' : chosen.size > 0 ? `Invite ${chosen.size}` : 'Invite'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

interface ButtonProps {
  today: DayKey
  title: string
  about: string
  /** Friends who can't be invited: already in the group. */
  exclude?: readonly string[]
  send: (to: string[]) => Promise<number>
}

/**
 * "Invite friends", wherever there's something to invite them to: only for a signed-in player with friends who
 * aren't in it already (`exclude`).
 */
export function InviteFriendsButton({ today, title, about, exclude = [], send }: ButtonProps) {
  const { now } = useMyFriends(today)
  const [open, setOpen] = useState(false)
  const left = new Set(exclude)
  const friends = now?.friends.filter((f) => !left.has(f.user_id)) ?? []
  if (!now?.code || now.friends.length === 0) return null
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Invite friends
      </button>
      <InviteFriendsDialog open={open} title={title} about={about} friends={friends} send={send} onClose={() => setOpen(false)} />
    </>
  )
}
