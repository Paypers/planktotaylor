import { useEffect, useSyncExternalStore } from 'react'
import { friendsNow, useAccount } from './account'
import type { DayKey } from './dates'
import { CHECK_IN_MS, type FriendsNow } from './friends'

// The friends list, shared by everything that shows it. The check-in (friends_now) brings it up to date and
// tells friends you're here: every 45 seconds while something showing friends is on screen and the page is in
// view, straight away on coming back to the page a while later, and after any change.

export interface MyFriends {
  /** Undefined until loaded; null when the site doesn't have friends yet. */
  now: FriendsNow | null | undefined
  /** The last check-in didn't work: what's shown is from before, if anything. */
  failed: boolean
}

const NOT_LOADED: MyFriends = { now: undefined, failed: false }

let state = NOT_LOADED
/** Whose list it is, and for which day: `${user id} ${day}`. */
let loadedFor = ''
let checkedAt = 0
let checking: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
/** How many things showing friends are on screen. */
let watching = 0
const listeners = new Set<() => void>()

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

function setState(next: MyFriends) {
  state = next
  listeners.forEach((fn) => fn())
}

/** The next check-in, while anything's watching and the page is in view. */
function schedule() {
  clearTimeout(timer)
  if (watching > 0 && visible() && loadedFor) timer = setTimeout(() => void checkIn(), CHECK_IN_MS)
}

function checkIn(): Promise<void> {
  if (checking) return checking
  const key = loadedFor
  const today = key.split(' ')[1]
  checkedAt = Date.now()
  const current = (async () => {
    try {
      const now = await friendsNow(today, null)
      if (key === loadedFor) setState({ now, failed: false })
    } catch {
      if (key === loadedFor) setState({ now: state.now ?? null, failed: true })
    }
  })()
  checking = current
  void current.finally(() => {
    if (checking === current) checking = null
    schedule()
  })
  return current
}

/** Checks in again now, after a change: a request, an answer, a removal, a block, a new code. */
export function refreshFriends(): Promise<void> {
  return loadedFor ? checkIn() : Promise.resolve()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!visible()) return clearTimeout(timer)
    if (watching > 0 && loadedFor && !checking && Date.now() - checkedAt > CHECK_IN_MS) void checkIn()
    else schedule()
  })
}

/** The signed-in player's friends, checked in on while this is on screen. */
export function useMyFriends(today: DayKey): MyFriends {
  const { user } = useAccount()
  const key = user ? `${user.id} ${today}` : ''

  useEffect(() => {
    if (!key) return
    watching += 1
    if (key !== loadedFor) {
      // Someone else signed in: nothing of the last player's shows. A new day keeps the list up meanwhile.
      if (key.split(' ')[0] !== loadedFor.split(' ')[0]) setState(NOT_LOADED)
      loadedFor = key
      void checkIn()
    } else if (!checking && Date.now() - checkedAt > CHECK_IN_MS) void checkIn()
    else schedule()
    return () => {
      watching -= 1
      if (watching === 0) clearTimeout(timer)
    }
  }, [key])

  const shown = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
  return key ? shown : NOT_LOADED
}
