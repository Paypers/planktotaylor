import { useState, type FormEvent } from 'react'
import { answerFriendRequest, askToSignIn, blockPlayer, cancelFriendRequest, saveDisplayName, unblockPlayer, useAccount } from '../../lib/account'
import type { DayKey } from '../../lib/dates'
import { FRIENDS_EACH, friendsInOrder, friendStatus, timeAgo, type Friend, type FriendsNow } from '../../lib/friends'
import { nudgeFriends } from '../../lib/friendInbox'
import { refreshFriends, useMyFriends } from '../../lib/myFriends'
import { followLink, friendsRoute, hashFor, type FriendsTab } from '../../lib/route'
import { PageTop } from '../PageTop'
import { AddFriend, WhatFriendsSee } from './AddFriend'
import { FriendCard } from './FriendCard'
import { FriendRow, friendProblemText, PersonRow } from './FriendRow'
import { InviteList } from './Invites'

/** Your friends, on tabs as on Discord: everyone, who's online, requests, who you've blocked, and adding someone. */
export function FriendsPage({ tab, today }: { tab: FriendsTab; today: DayKey }) {
  const { user, profile } = useAccount()
  const { now, failed } = useMyFriends(today)
  const [open, setOpen] = useState<Friend | null>(null)

  let body
  if (!user) body = <SignedOut />
  else if (now === undefined) body = <Note text="Loading your friends…" />
  else if (now === null) body = <Note text="Friends aren't set up on this site yet." />
  else if (!profile.name || !now.code) body = <NameFirst />
  else {
    body = (
      <>
        <Tabs tab={tab} now={now} />
        {now.invites.length > 0 && (
          <section className="section grid" aria-labelledby="friends-invites">
            <div className="section-rule" />
            <div className="section-label">
              <h2 id="friends-invites">Invites</h2>
              <p className="label-meta">{now.invites.length}</p>
            </div>
            <div className="section-body">
              <InviteList invites={now.invites} today={today} />
            </div>
          </section>
        )}
        {failed && (
          <div className="grid">
            <p className="page-note error" role="alert">
              Couldn't reach the site just now. What's here may be out of date.
            </p>
          </div>
        )}
        {tab === 'all' && <FriendList now={now} online={false} onOpen={setOpen} />}
        {tab === 'online' && <FriendList now={now} online onOpen={setOpen} />}
        {tab === 'pending' && <Pending now={now} />}
        {tab === 'blocked' && <Blocked now={now} />}
        {tab === 'add' && <AddFriend code={now.code} />}
      </>
    )
  }

  // The card follows the list as it's checked in on, so it shows the friend as they are now.
  const shown = open && now ? (now.friends.find((f) => f.user_id === open.user_id) ?? null) : null
  return (
    <div className="info-page friends-page">
      <PageTop title="Friends" />
      {body}
      <FriendCard friend={shown} today={today} onClose={() => setOpen(null)} />
    </div>
  )
}

function Note({ text }: { text: string }) {
  return (
    <div className="grid">
      <p className="page-note fine">{text}</p>
    </div>
  )
}

function SignedOut() {
  return (
    <>
      <section className="section grid" aria-labelledby="friends-signed-out">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="friends-signed-out">Plank with friends</h2>
        </div>
        <div className="section-body">
          <p className="groups-lede">
            Add friends with a code or a link, see when they're online and planking, and pull them into a plank together.
            Friends are for signed-in players.
          </p>
          <button type="button" className="btn btn-primary" onClick={askToSignIn}>
            Sign in
          </button>
        </div>
      </section>
      <WhatFriendsSee />
    </>
  )
}

/** Friends see your name: one first, then the rest. */
function NameFirst() {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    saveDisplayName(name)
      .then(() => refreshFriends())
      .catch(() => setError("Couldn't save your name just now. Try again in a moment."))
      .finally(() => setBusy(false))
  }
  return (
    <>
      <section className="section grid" aria-labelledby="friends-name">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="friends-name">Your name first</h2>
        </div>
        <form className="section-body group-form" onSubmit={submit}>
          <p className="groups-lede">Friends see you by your name, so choose one to get your friend code.</p>
          <label className="field">
            <span>Your name, as friends see it</span>
            <input className="input" value={name} maxLength={40} autoComplete="nickname" required onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ''}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <WhatFriendsSee />
    </>
  )
}

function Tabs({ tab, now }: { tab: FriendsTab; now: FriendsNow }) {
  const online = now.friends.filter((f) => friendStatus(f) !== 'offline').length
  const tabs: { id: FriendsTab; label: string; count?: number; badge?: number }[] = [
    { id: 'all', label: 'All', count: now.friends.length },
    { id: 'online', label: 'Online', count: online },
    { id: 'pending', label: 'Pending', badge: now.requests_in.length },
    { id: 'blocked', label: 'Blocked' },
    { id: 'add', label: 'Add a friend' },
  ]
  return (
    <div className="grid">
      <nav className="friends-tabs" aria-label="Friends">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={hashFor(friendsRoute(t.id))}
            onClick={(e) => followLink(e, friendsRoute(t.id))}
            aria-current={t.id === tab ? 'page' : undefined}
            className={t.id === 'add' ? 'friends-tab add' : 'friends-tab'}
          >
            {t.label}
            {t.count !== undefined && <span className="friends-tab-count">{t.count}</span>}
            {t.badge ? (
              <span className="friends-tab-badge">
                {t.badge}
                <span className="sr-only"> waiting for you</span>
              </span>
            ) : null}
          </a>
        ))}
      </nav>
    </div>
  )
}

function FriendList({ now, online, onOpen }: { now: FriendsNow; online: boolean; onOpen: (friend: Friend) => void }) {
  const friends = friendsInOrder(now.friends).filter((f) => !online || friendStatus(f) !== 'offline')
  const at = Date.now()
  return (
    <section className="section grid" aria-labelledby="friends-list">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-list">{online ? 'Online now' : 'All friends'}</h2>
        <p className="label-meta">{online ? friends.length : `${friends.length} of ${FRIENDS_EACH}`}</p>
      </div>
      <div className="section-body">
        {friends.length > 0 ? (
          <ul className="member-list friend-list">
            {friends.map((f) => (
              <FriendRow key={f.user_id} friend={f} now={at} onOpen={() => onOpen(f)} />
            ))}
          </ul>
        ) : online ? (
          <p className="groups-lede">Nobody's online right now.</p>
        ) : (
          <p className="groups-lede">
            No friends yet.{' '}
            <a href={hashFor(friendsRoute('add'))} onClick={(e) => followLink(e, friendsRoute('add'))}>
              Add a friend
            </a>{' '}
            with their code or link, or from your groups.
          </p>
        )}
      </div>
    </section>
  )
}

/** Runs a change, then checks in again, keeping track of which row is busy and what went wrong. */
function useChange() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const change = (id: string, what: () => Promise<void>) => {
    setBusy(id)
    setError(null)
    what()
      .then(() => refreshFriends())
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(null))
  }
  const shownError = error && (
    <p className="error" role="alert">
      {error}
    </p>
  )
  return { busy, change, shownError }
}

function Pending({ now }: { now: FriendsNow }) {
  const { busy, change, shownError } = useChange()
  const at = Date.now()
  const nothing = now.requests_in.length === 0 && now.requests_out.length === 0
  return (
    <>
      <section className="section grid" aria-labelledby="friends-requests-in">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="friends-requests-in">Requests for you</h2>
          <p className="label-meta">{now.requests_in.length}</p>
        </div>
        <div className="section-body">
          {now.requests_in.length > 0 ? (
            <ul className="member-list">
              {now.requests_in.map((p) => (
                <PersonRow key={p.user_id} name={p.name} url={p.avatar_url} note={p.at && `Asked ${timeAgo(p.at, at)}`}>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={busy === p.user_id}
                    onClick={() =>
                      change(p.user_id, async () => {
                        await answerFriendRequest(p.user_id, true)
                        void nudgeFriends([p.user_id])
                      })
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busy === p.user_id}
                    onClick={() => change(p.user_id, () => answerFriendRequest(p.user_id, false))}
                    aria-label={`Decline ${p.name}`}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-small"
                    disabled={busy === p.user_id}
                    onClick={() => change(p.user_id, () => blockPlayer(p.user_id))}
                    aria-label={`Block ${p.name}`}
                  >
                    Block
                  </button>
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="groups-lede">{nothing ? 'No requests waiting.' : 'None waiting for you.'}</p>
          )}
          {now.requests_in.length > 0 && (
            <p className="fine">Declining is quiet: they aren't told, and their request just goes. Blocking also stops any more.</p>
          )}
          {shownError}
        </div>
      </section>
      {now.requests_out.length > 0 && (
        <section className="section grid" aria-labelledby="friends-requests-out">
          <div className="section-rule" />
          <div className="section-label">
            <h2 id="friends-requests-out">Sent</h2>
            <p className="label-meta">{now.requests_out.length}</p>
          </div>
          <div className="section-body">
            <ul className="member-list">
              {now.requests_out.map((p) => (
                <PersonRow key={p.user_id} name={p.name} url={p.avatar_url} note={p.at && `Sent ${timeAgo(p.at, at)}`}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busy === p.user_id}
                    onClick={() => change(p.user_id, () => cancelFriendRequest(p.user_id))}
                    aria-label={`Cancel your request to ${p.name}`}
                  >
                    Cancel
                  </button>
                </PersonRow>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}

function Blocked({ now }: { now: FriendsNow }) {
  const { busy, change, shownError } = useChange()
  return (
    <section className="section grid" aria-labelledby="friends-blocked">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-blocked">Blocked</h2>
        <p className="label-meta">{now.blocked.length}</p>
      </div>
      <div className="section-body">
        {now.blocked.length > 0 ? (
          <ul className="member-list">
            {now.blocked.map((p) => (
              <PersonRow key={p.user_id} name={p.name} url={p.avatar_url}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={busy === p.user_id}
                  onClick={() => change(p.user_id, () => unblockPlayer(p.user_id))}
                  aria-label={`Unblock ${p.name}`}
                >
                  Unblock
                </button>
              </PersonRow>
            ))}
          </ul>
        ) : (
          <p className="groups-lede">Nobody's blocked.</p>
        )}
        <p className="fine">
          Requests and invites from someone you've blocked go nowhere, and they're never told. Block anyone from their card,
          on your friends list.
        </p>
        {shownError}
      </div>
    </section>
  )
}
