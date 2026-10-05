import { useEffect, useState } from 'react'
import {
  answerFriendRequest,
  askToSignIn,
  cancelFriendRequest,
  findByFriendCode,
  requestFriend,
  unblockPlayer,
  useAccount,
  type FoundPlayer,
} from '../../lib/account'
import { forgetFriendCode, keepFriendCode, readFriendCode } from '../../lib/friends'
import { refreshFriends } from '../../lib/myFriends'
import { FRIENDS, followLink, friendsRoute, hashFor } from '../../lib/route'
import { Avatar } from '../Avatar'
import { useGroupName } from '../Groups'
import { PageTop } from '../PageTop'
import { WhatFriendsSee } from './AddFriend'
import { friendProblemText } from './FriendRow'

/** A friend link: who it's for, and where you stand with them. Signed out, it's kept through signing in. */
export function FriendLinkPage({ code }: { code: string }) {
  const { user } = useAccount()
  const valid = readFriendCode(code)
  /** Undefined while loading; null for a code that isn't anyone's. */
  const [found, setFound] = useState<FoundPlayer | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const you = useGroupName('Your name, as friends see it')

  const look = () => {
    if (!valid) return Promise.resolve(setFound(null))
    return findByFriendCode(valid).then(setFound)
  }

  useEffect(() => {
    if (!user) {
      // Kept for when sign-in brings them back to the front page.
      if (valid) keepFriendCode(valid)
      return
    }
    forgetFriendCode()
    let live = true
    setFound(undefined)
    ;(valid ? findByFriendCode(valid) : Promise.resolve(null))
      .then((player) => live && setFound(player))
      .catch((e) => live && setError(friendProblemText(e)))
    return () => {
      live = false
    }
  }, [valid, user])

  const act = (what: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    you
      .ready()
      .then(what)
      .then(() => Promise.all([look(), refreshFriends()]))
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(false))
  }

  const name = found?.name ?? 'them'
  let body
  if (!user) {
    body = (
      <>
        <p className="groups-lede">
          Someone sent you their friend link. Friends are for signed-in players: sign in, and you'll come back here to add
          them.
        </p>
        <button type="button" className="btn btn-primary" onClick={askToSignIn}>
          Sign in to add them
        </button>
      </>
    )
  } else if (found === undefined) {
    body = error ? null : <p className="fine">Opening the link…</p>
  } else if (found === null) {
    body = <p className="groups-lede">This friend link doesn't work. It may be an old one: ask them for a new one.</p>
  } else if (found.status === 'me') {
    body = (
      <p className="groups-lede">
        This is your own friend link. Whoever opens it can send you a request.{' '}
        <a href={hashFor(friendsRoute('add'))} onClick={(e) => followLink(e, friendsRoute('add'))}>
          Share it
        </a>
      </p>
    )
  } else if (found.status === 'friends') {
    body = (
      <p className="groups-lede">
        You and {name} are friends.{' '}
        <a href={hashFor(FRIENDS)} onClick={(e) => followLink(e, FRIENDS)}>
          Your friends
        </a>
      </p>
    )
  } else if (found.status === 'sent') {
    body = (
      <>
        <p className="groups-lede">Your request to {name} is waiting for an answer.</p>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => cancelFriendRequest(found.user_id))}>
            Cancel request
          </button>
        </div>
      </>
    )
  } else if (found.status === 'blocked') {
    body = (
      <>
        <p className="groups-lede">You've blocked {name}. Unblock them to add them as a friend.</p>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => unblockPlayer(found.user_id))}>
            Unblock
          </button>
        </div>
      </>
    )
  } else {
    const asked = found.status === 'received'
    body = (
      <div className="group-form">
        <p className="groups-lede">{asked ? `${name} asked to be your friend.` : `Add ${name} as a friend?`}</p>
        {you.field}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || you.missing}
            onClick={() => act(() => (asked ? answerFriendRequest(found.user_id, true) : requestFriend(valid!)))}
          >
            {busy ? 'Just a moment…' : asked ? 'Accept' : 'Send request'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="info-page friends-page">
      <PageTop title={found ? found.name : 'Add a friend'} />
      <section className="section grid" aria-labelledby="friend-link-heading">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="friend-link-heading">Friend link</h2>
        </div>
        <div className="section-body">
          {found && (
            <div className="friend-found">
              <Avatar name={found.name} url={found.avatar_url} size={56} />
              <span className="member-name">{found.name}</span>
            </div>
          )}
          {body}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <WhatFriendsSee />
    </div>
  )
}
