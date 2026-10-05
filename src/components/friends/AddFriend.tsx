import { useEffect, useState, type FormEvent } from 'react'
import { findByFriendCode, friendSuggestions, newFriendCode, requestFriend, requestFriendFromGroup, type Suggestion } from '../../lib/account'
import { nudgeFriends } from '../../lib/friendInbox'
import { readFriendCode, showFriendCode } from '../../lib/friends'
import { refreshFriends } from '../../lib/myFriends'
import { siteLink } from '../../lib/share'
import { friendProblemText, PersonRow } from './FriendRow'

/** A friend link: whoever opens it can send a request. */
export const friendLink = (code: string) => `${siteLink()}#friend/${showFriendCode(code)}`

/** Your code and link to share, a box for someone else's code, and people you plank with in your groups. */
export function AddFriend({ code }: { code: string }) {
  return (
    <>
      <YourCode code={code} />
      <AddByCode />
      <Suggestions />
      <WhatFriendsSee />
    </>
  )
}

function YourCode({ code }: { code: string }) {
  const [said, setSaid] = useState<string | null>(null)
  const [renewing, setRenewing] = useState<'asking' | 'busy' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const link = friendLink(code)

  const share = async () => {
    const text = 'Add me as a friend on Plank to Taylor:'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Plank to Taylor', text, url: link })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`)
      setSaid('Link copied.')
    } catch {
      // The link is on screen to copy by hand.
    }
  }

  const copyCode = () =>
    navigator.clipboard.writeText(showFriendCode(code)).then(
      () => setSaid('Code copied.'),
      () => {},
    )

  const renew = () => {
    setRenewing('busy')
    setError(null)
    newFriendCode()
      .then(() => refreshFriends())
      .then(() => setSaid('A new code. The old one, and its link, no longer work.'))
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setRenewing(null))
  }

  return (
    <section className="section grid" aria-labelledby="friends-code">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-code">Your friend code</h2>
      </div>
      <div className="section-body friend-code-body">
        <p className="friend-code" aria-label={`Your friend code: ${showFriendCode(code).split('').join(' ')}`}>
          {showFriendCode(code)}
        </p>
        <p className="groups-lede">Give someone your code, or send your friend link. Either way, they can send you a request.</p>
        <div className="invite-link">
          <label className="field">
            <span>Friend link</span>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => void share()}>
              Share link
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void copyCode()}>
              Copy code
            </button>
          </div>
        </div>
        {said && (
          <p className="fine" role="status">
            {said}
          </p>
        )}
        {renewing === 'asking' ? (
          <div className="friend-card-confirm">
            <p>Make a new code? The old one, and its link, stop working. Your friends stay your friends.</p>
            <div className="button-row">
              <button type="button" className="btn btn-primary" onClick={() => setRenewing(null)} autoFocus>
                Keep this one
              </button>
              <button type="button" className="btn btn-secondary" onClick={renew}>
                Make a new code
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-link" onClick={() => setRenewing('asking')} disabled={renewing === 'busy'}>
            {renewing === 'busy' ? 'Making a new code…' : 'Make a new code'}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

function AddByCode() {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const code = readFriendCode(typed)
    setSaid(null)
    setError(null)
    if (!code) {
      setError('A friend code is 8 letters and numbers, like K7QM-3XPD.')
      return
    }
    setBusy(true)
    ;(async () => {
      const found = await findByFriendCode(code)
      if (!found) return setError('Nobody has that friend code. Check it, or ask them for their friend link.')
      if (found.status === 'me') return setError("That's your own code.")
      if (found.status === 'friends') return setSaid(`You and ${found.name} are friends already.`)
      if (found.status === 'blocked') return setError(`You've blocked ${found.name}. Unblock them first, under Blocked.`)
      const result = await requestFriend(code)
      void nudgeFriends([found.user_id])
      await refreshFriends()
      setTyped('')
      setSaid(result === 'friends' ? `You and ${found.name} are friends now.` : `Request sent to ${found.name}.`)
    })()
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="section grid" aria-labelledby="friends-by-code">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-by-code">Add by code</h2>
      </div>
      <form className="section-body group-form" onSubmit={submit}>
        <label className="field">
          <span>Their friend code, or friend link</span>
          <input
            className="input friend-code-input"
            value={typed}
            placeholder="K7QM-3XPD"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy || typed.trim() === ''}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
        {said && (
          <p className="fine" role="status">
            {said}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}

/** People in your groups who aren't friends yet: a request with no code needed. */
function Suggestions() {
  /** Undefined while loading. */
  const [people, setPeople] = useState<Suggestion[] | undefined>(undefined)
  const [sent, setSent] = useState<ReadonlyMap<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    friendSuggestions()
      .then((found) => live && setPeople(found))
      .catch(() => live && setPeople([]))
    return () => {
      live = false
    }
  }, [])

  if (!people || people.length === 0) return null
  const ask = (person: Suggestion) => {
    setError(null)
    requestFriendFromGroup(person.user_id)
      .then((result) => {
        setSent((was) => new Map(was).set(person.user_id, result === 'friends' ? 'Friends now' : 'Request sent'))
        void nudgeFriends([person.user_id])
        return refreshFriends()
      })
      .catch((e) => setError(friendProblemText(e)))
  }

  return (
    <section className="section grid" aria-labelledby="friends-suggested">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-suggested">People you plank with</h2>
        <p className="label-note">From your groups, and not your friends yet.</p>
      </div>
      <div className="section-body">
        <ul className="member-list">
          {people.map((person) => (
            <PersonRow key={person.user_id} name={person.name} url={person.avatar_url} note={person.group_name}>
              {sent.has(person.user_id) ? (
                <span className="fine">{sent.get(person.user_id)}</span>
              ) : (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => ask(person)}>
                  Add
                </button>
              )}
            </PersonRow>
          ))}
        </ul>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/** Exactly what friends see of each other, here and on a friend link. */
export function WhatFriendsSee() {
  return (
    <section className="section grid" aria-labelledby="friends-see">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="friends-see">What friends see of you</h2>
      </div>
      <dl className="section-body rules">
        <dt>You</dt>
        <dd>Your name and photo.</dd>
        <dt>Right now</dt>
        <dd>
          A green dot while you have the site open, and "Planking now" while you plank. You can hide both in Settings →
          Friends: then friends see you as offline, and never when you planked.
        </dd>
        <dt>Your planks</dt>
        <dd>
          Your streak, and whether you've planked today's song, with a green tick if it was with no breaks. Never your
          breaks, your XP, your rank, your ladder or your plank history.
        </dd>
        <dt>Finding you</dt>
        <dd>
          Only by your friend code or link, or from a group you're both in. There's no search, and no list of players.
        </dd>
      </dl>
    </section>
  )
}
