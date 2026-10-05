import { useEffect, useSyncExternalStore } from 'react'
import { friendsNow, useAccount } from './account'
import type { DayKey } from './dates'
import { CHECK_IN_MS, type FriendsNow } from './friends'
import { plankingUntil } from './plankingNow/presence'

// The friends list, shared by everything that shows it. The check-in (friends_now) brings it up to date and
// tells friends you're here, and whether you're planking: every 45 seconds while something showing friends is
// on screen and the page is in view (the app always is, signed in), straight away on coming back to the page a
// while later, when a plank starts or stops, and after any change.

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
/** Something changed while a check-in was on its way: another, once it's back. */
let again = false
/** While the plank screen is on: until when this device counts as planking now. */
let planking: number | null = null
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
  // A site without friends set up (null) isn't asked again until the page is opened again. A failed check-in is.
  if (watching > 0 && visible() && loadedFor && (state.now !== null || state.failed)) timer = setTimeout(() => void checkIn(), CHECK_IN_MS)
}

function checkIn(): Promise<void> {
  if (checking) {
    again = true
    return checking
  }
  const key = loadedFor
  const today = key.split(' ')[1]
  checkedAt = Date.now()
  const current = (async () => {
    try {
      const now = await friendsNow(today, planking)
      if (key === loadedFor) setState({ now, failed: false })
    } catch {
      // What's shown stays, marked out of date. With nothing yet, it's still loading (and tried again shortly): null is
      // only for a site without friends, and would hide them everywhere until the next check-in.
      if (key === loadedFor) setState({ now: state.now, failed: true })
    }
  })()
  checking = current
  void current.finally(() => {
    if (checking === current) checking = null
    if (again) {
      again = false
      void checkIn()
    } else schedule()
  })
  return current
}

/** While the plank screen is on (`active`), friends see this device as planking now: told straight away. */
export function useTellFriendsImPlanking(active: boolean, songSeconds: number) {
  useEffect(() => {
    if (!active) return
    planking = plankingUntil(songSeconds, Date.now())
    if (loadedFor) void checkIn()
    return () => {
      planking = null
      if (loadedFor) void checkIn()
    }
  }, [active, songSeconds])
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
