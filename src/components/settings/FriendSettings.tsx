import { useState } from 'react'
import { askToSignIn, setShowOnline, useAccount } from '../../lib/account'
import { useToday } from '../../lib/hooks'
import { refreshFriends, useMyFriends } from '../../lib/myFriends'
import { FRIENDS, followLink, hashFor } from '../../lib/route'

/** Settings → Friends: whether friends see when you're online. */
export function FriendSettings() {
  const { user } = useAccount()
  const today = useToday()
  const { now } = useMyFriends(today)
  // Shown straight away, while the change goes to the account.
  const [showing, setShowing] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!user) {
    return (
      <section className="settings-group">
        <p>Add friends, see when they're online and planking, and plank together. Friends are for signed-in players.</p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={askToSignIn}>
            Sign in
          </button>
        </div>
      </section>
    )
  }
  if (now === undefined) return <p className="fine">Loading…</p>
  if (now === null) return <p className="settings-note">Friends aren't set up on this site yet.</p>

  const on = showing ?? now.show_online
  const change = (show: boolean) => {
    setShowing(show)
    setError(null)
    setShowOnline(show)
      .then(() => refreshFriends())
      .then(() => setShowing(null))
      .catch(() => {
        setShowing(null)
        setError("Couldn't save that just now. Try again in a moment.")
      })
  }

  return (
    <>
      <section className="settings-group" aria-labelledby="online-heading">
        <h3 id="online-heading">Online</h3>
        <p>
          While you have the site open, your friends see a green dot on your photo, and "Planking now" while you plank,
          with when you planked today's song.
        </p>
        <label className="switch-row">
          <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
          <span>Show when I'm online</span>
        </label>
        <p className="fine">
          Turned off, friends see you as offline, never planking, and not when you planked: only whether you've planked
          today's song, as a group sees. You still see when they're online.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <p className="fine">
        <a href={hashFor(FRIENDS)} onClick={(e) => followLink(e, FRIENDS)}>
          Your friends
        </a>
        : add someone, answer requests, and see who you've blocked.
      </p>
    </>
  )
}
