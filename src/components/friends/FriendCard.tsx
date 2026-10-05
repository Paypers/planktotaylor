import { useEffect, useState } from 'react'
import { SONG_BY_ID } from '../../data/songs'
import { blockPlayer, friendCard, removeFriend, type FriendCard as CardData } from '../../lib/account'
import type { DayKey } from '../../lib/dates'
import { activityLine, friendStatus, type Friend } from '../../lib/friends'
import { refreshFriends } from '../../lib/myFriends'
import { followLink, groupRoute, hashFor } from '../../lib/route'
import { streakInfo } from '../../lib/streaks'
import { Dialog } from '../Dialog'
import { Flame, HeldMark } from '../Icon'
import { friendProblemText, StatusAvatar } from './FriendRow'

type Asking = 'remove' | 'block' | null

/**
 * A friend in full: their streak, today's song, since when you've been friends and the groups you share. Then
 * what you can do: remove them, or block them.
 */
export function FriendCard({ friend, today, onClose }: { friend: Friend | null; today: DayKey; onClose: () => void }) {
  return (
    <Dialog open={friend !== null} title={friend?.name ?? ''} onClose={onClose}>
      {friend && <CardBody key={friend.user_id} friend={friend} today={today} onClose={onClose} />}
    </Dialog>
  )
}

function CardBody({ friend, today, onClose }: { friend: Friend; today: DayKey; onClose: () => void }) {
  /** Undefined while loading; null if it couldn't be. */
  const [card, setCard] = useState<CardData | null | undefined>(undefined)
  const [asking, setAsking] = useState<Asking>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    friendCard(friend.user_id)
      .then((found) => live && setCard(found))
      .catch(() => live && setCard(null))
    return () => {
      live = false
    }
  }, [friend.user_id])

  const days = new Set([...(card?.days ?? []), ...(friend.planked_today ? [today] : [])])
  const streak = card ? streakInfo(days, today) : null
  const song = friend.planked_song ? SONG_BY_ID.get(friend.planked_song)?.title : undefined
  const since = card?.since ? new Date(card.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null

  const act = (what: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    what()
      .then(() => refreshFriends())
      .then(onClose)
      .catch((e) => setError(friendProblemText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="friend-card">
      <div className="friend-card-top">
        <StatusAvatar name={friend.name} url={friend.avatar_url} size={64} status={friendStatus(friend)} />
        <p className="friend-card-activity">{activityLine(friend, Date.now())}</p>
      </div>

      <dl className="friend-facts">
        <dt>Streak</dt>
        <dd>
          {streak === null ? (
            card === undefined ? (
              '…'
            ) : (
              'Not loaded'
            )
          ) : streak.current > 0 ? (
            <span className="friend-streak">
              <Flame size={18} lit={streak.doneToday} />
              {streak.current} {streak.current === 1 ? 'day' : 'days'}
            </span>
          ) : (
            'None going'
          )}
        </dd>
        <dt>Today</dt>
        <dd>
          {!friend.planked_today ? (
            "Not planked today's song yet"
          ) : friend.clean_today ? (
            <span className="friend-today">
              <HeldMark />
              Planked {song ?? "today's song"}, no breaks
            </span>
          ) : (
            `Planked ${song ?? "today's song"}`
          )}
        </dd>
        {since && (
          <>
            <dt>Friends since</dt>
            <dd>{since}</dd>
          </>
        )}
        {card && card.groups.length > 0 && (
          <>
            <dt>Groups you share</dt>
            <dd>
              <ul className="friend-groups">
                {card.groups.map((g) => (
                  <li key={g.id}>
                    <a
                      href={hashFor(groupRoute(g.id))}
                      onClick={(e) => {
                        followLink(e, groupRoute(g.id))
                        onClose()
                      }}
                    >
                      {g.name}
                    </a>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {asking === null ? (
        <div className="button-row friend-card-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setAsking('remove')}>
            Remove friend
          </button>
          <button type="button" className="btn btn-link" onClick={() => setAsking('block')}>
            Block
          </button>
        </div>
      ) : (
        <div className="friend-card-confirm" role="group" aria-label={asking === 'remove' ? 'Remove friend' : 'Block'}>
          <p>
            {asking === 'remove'
              ? `Remove ${friend.name} as a friend? You can ask again later, with their code.`
              : `Block ${friend.name}? This removes them as a friend, and anything they send you after goes nowhere. They aren't told.`}
          </p>
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={() => setAsking(null)} disabled={busy} autoFocus>
              Keep
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => act(() => (asking === 'remove' ? removeFriend(friend.user_id) : blockPlayer(friend.user_id)))}
            >
              {busy ? 'Just a moment…' : asking === 'remove' ? 'Remove' : 'Block'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
