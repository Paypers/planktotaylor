import { useEffect, useState } from 'react'
import {
  accountsEnabled,
  answerFriendRequest,
  askToJoin,
  askToSignIn,
  cancelFriendRequest,
  findByFriendCode,
  previewFriendLink,
  requestFriend,
  unblockPlayer,
  useAccount,
  type FoundPlayer,
} from '../../lib/account'
import { nudgeFriends } from '../../lib/friendInbox'
import { forgetFriendCode, keepFriendCode, readFriendCode } from '../../lib/friends'
import { refreshFriends } from '../../lib/myFriends'
import { FRIENDS, followLink, friendsRoute, hashFor } from '../../lib/route'
import { Avatar } from '../Avatar'
import { useGroupName } from '../Groups'
import { PageTop } from '../PageTop'
import { WhatFriendsSee } from './AddFriend'
import { friendProblemText } from './FriendRow'

/**
 * A profile link: whose it is, and where you stand with them. Signed out, it shows who by name and photo, and asks
 * them to make an account (or sign in) to add them; the link is kept through that, and brings them back here.
 */
export function FriendLinkPage({ code }: { code: string }) {
  const { user } = useAccount()
  const valid = readFriendCode(code)
  /** Undefined while loading; null for a code that isn't anyone's. */
  const [found, setFound] = useState<FoundPlayer | null | undefined>(undefined)
  /** Signed out: whose link it is. Undefined while loading; null for a code that isn't anyone's. */
  const [preview, setPreview] = useState<{ name: string; avatar_url: string | null } | null | undefined>(undefined)
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
      let live = true
      ;(valid && accountsEnabled ? previewFriendLink(valid) : Promise.resolve(null))
        .then((shown) => live && setPreview(shown))
        .catch(() => live && setPreview(null))
      return () => {
        live = false
      }
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

  const shown = user ? found : preview
  const name = shown?.name ?? 'them'
  let body
  if (!accountsEnabled) {
    body = <p className="groups-lede">Friends aren't set up on this site.</p>
  } else if (!user) {
    body =
      preview === undefined ? (
        <p className="fine">Opening the link…</p>
      ) : preview === null ? (
        <p className="groups-lede">This profile link doesn't work. It may be an old one: ask them for a new one.</p>
      ) : (
        <>
          <p className="groups-lede">
            {name} wants to plank with you. On Plank to Taylor you hold a plank for the length of a Taylor Swift song: the
            same song as everyone, each day. Make a free account to add {name} as a friend, and you'll come back here to send
            your request.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                askToJoin({
                  title: 'Make an account',
                  lede: `To add ${name} as a friend. Type your email and we'll send you a link to sign in with: no password, and if you have an account already, it's the same.`,
                })
              }
            >
              Make an account
            </button>
            <button type="button" className="btn btn-secondary" onClick={askToSignIn}>
              I have an account
            </button>
          </div>
        </>
      )
  } else if (found === undefined) {
    body = error ? null : <p className="fine">Opening the link…</p>
  } else if (found === null) {
    body = <p className="groups-lede">This profile link doesn't work. It may be an old one: ask them for a new one.</p>
  } else if (found.status === 'me') {
    body = (
      <p className="groups-lede">
        This is your own profile link. Whoever opens it sees your name and photo, and can send you a request.{' '}
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
            onClick={() =>
              act(async () => {
                await (asked ? answerFriendRequest(found.user_id, true) : requestFriend(valid!))
                void nudgeFriends([found.user_id])
              })
            }
          >
            {busy ? 'Just a moment…' : asked ? 'Accept' : 'Send request'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="info-page friends-page">
      <PageTop title={shown ? shown.name : 'Add a friend'} />
      <section className="section grid" aria-labelledby="friend-link-heading">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="friend-link-heading">Profile link</h2>
        </div>
        <div className="section-body">
          {shown && (
            <div className="friend-found">
              <Avatar name={shown.name} url={shown.avatar_url} size={56} />
              <span className="member-name">{shown.name}</span>
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
