import { useEffect, useSyncExternalStore } from 'react'
import { loadBoard, loadGroups, useAccount, type Group } from './account'
import type { DayKey } from './dates'
import type { BoardMember } from './groups'

// The player's groups and each one's board, shared by the pages that show them (home, Groups, a group's
// page), so going between them doesn't wait on the account again. Loaded when first shown, again on coming
// back to the site a while later (the boards move all day), and after any change to a group.

export interface MyGroups {
  /** Undefined until loaded; null when the site doesn't have groups yet. */
  groups: Group[] | null | undefined
  /** Each group's board, once it's loaded. */
  boards: ReadonlyMap<string, BoardMember[]>
  /** The last load didn't work: what's shown is from before, if anything. */
  failed: boolean
}

const NOT_LOADED: MyGroups = { groups: undefined, boards: new Map(), failed: false }
/** Coming back to the site sooner than this doesn't load them again. */
const FRESH_MS = 60_000

let state = NOT_LOADED
/** Whose groups are loaded, and for which day: `${user id} ${day}`. */
let loadedFor = ''
let loadedAt = 0
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: MyGroups) {
  state = next
  listeners.forEach((fn) => fn())
}

function load(): Promise<void> {
  const key = loadedFor
  const today = key.split(' ')[1]
  loadedAt = Date.now()
  const current = (async () => {
    try {
      const groups = await loadGroups()
      const boards = new Map<string, BoardMember[]>()
      await Promise.all(
        (groups ?? []).map(async (group) => {
          const board = await loadBoard(group.id, today).catch(() => state.boards.get(group.id))
          if (board) boards.set(group.id, board)
        }),
      )
      if (key === loadedFor) setState({ groups, boards, failed: false })
    } catch {
      if (key === loadedFor) setState({ ...state, groups: state.groups ?? [], failed: true })
    }
  })()
  loading = current
  void current.finally(() => {
    if (loading === current) loading = null
  })
  return current
}

/** Loads the groups again, after a change to one: making, joining, leaving, renaming, a new link, removing. */
export function refreshGroups(): Promise<void> {
  return loadedFor ? load() : Promise.resolve()
}

/** The signed-in player's groups and boards, loaded as needed. */
export function useMyGroups(today: DayKey): MyGroups {
  const { user } = useAccount()
  const key = user ? `${user.id} ${today}` : ''

  useEffect(() => {
    if (!key) return
    if (key !== loadedFor) {
      // Someone else signed in: nothing of the last player's shows. A new day keeps the boards up meanwhile.
      if (key.split(' ')[0] !== loadedFor.split(' ')[0]) setState(NOT_LOADED)
      loadedFor = key
      void load()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !loading && Date.now() - loadedAt > FRESH_MS) void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
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
