import { useEffect, useState } from 'react'
import { answerFriendRequest, findByFriendCode, requestFriend, type FoundPlayer } from '../../lib/account'
import { nudgeFriends } from '../../lib/friendInbox'
import { refreshFriends } from '../../lib/myFriends'

/**
 * Someone in the room, as a possible friend: Add friend, Accept if they've asked, or just "Friend" or "Asked".
 * Only for people signed in with a name, whose friend code the room carries, seen by someone who is too.
 */
export function RoomFriend({ code }: { code: string }) {
  /** Undefined while looking; null for nobody to show anything for. */
  const [found, setFound] = useState<FoundPlayer | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    findByFriendCode(code)
      .then((player) => live && setFound(player))
      .catch(() => live && setFound(null))
    return () => {
      live = false
    }
  }, [code])

  if (!found || found.status === 'me' || found.status === 'blocked') return null
  if (found.status === 'friends') return <span className="member-notes room-friend">Friend</span>
  if (found.status === 'sent') return <span className="member-notes room-friend">Asked</span>

  const act = () => {
    setBusy(true)
    const asked = found.status === 'received'
    ;(asked ? answerFriendRequest(found.user_id, true).then(() => 'friends' as const) : requestFriend(code))
      .then((result) => {
        setFound({ ...found, status: result === 'friends' ? 'friends' : 'sent' })
        void nudgeFriends([found.user_id])
        return refreshFriends()
      })
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  return (
    <button type="button" className="btn btn-secondary btn-small room-friend" disabled={busy} onClick={act} aria-label={`${found.status === 'received' ? 'Accept' : 'Add'} ${found.name} as a friend`}>
      {found.status === 'received' ? 'Accept' : 'Add friend'}
    </button>
  )
}
