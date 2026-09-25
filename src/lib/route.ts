import { useSyncExternalStore, type MouseEvent } from 'react'
import { ALBUMS, type AlbumId } from '../data/songs'

// Pages live in the address's #hash, so any static host serves them and Back works.
// Sign-in links use the hash too (#access_token=…): anything that isn't a page here is left alone.

export type Route =
  | { page: 'home' }
  | { page: 'settings'; section: string | null }
  | { page: 'ranks' }
  | { page: 'help' }
  | { page: 'year' }
  | { page: 'eras'; album: AlbumId | null }
  | { page: 'groups' }
  | { page: 'group'; id: string }
  | { page: 'join'; code: string }

export const HOME: Route = { page: 'home' }
export const RANKS: Route = { page: 'ranks' }
export const HELP: Route = { page: 'help' }
/** Your Plank Year: the year in slides. */
export const YEAR: Route = { page: 'year' }
/** Settings → Discord: the daily post in a server. */
export const DISCORD: Route = { page: 'settings', section: 'discord' }
/** Collect the eras: every album, and how much of it is stamped. */
export const ERAS: Route = { page: 'eras', album: null }

/** Your groups. */
export const GROUPS: Route = { page: 'groups' }
/** A group's page: who's planked today, everyone's streaks, and the group's. */
export const groupRoute = (id: string): Route => ({ page: 'group', id })

/** A group's id, as the database makes them. */
const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** An album's page in Collect the eras. A release that joined an album is on that album's page. */
export const eraRoute = (album: AlbumId): Route => ({ page: 'eras', album: ALBUMS[album].partOf ?? album })

export function parseRoute(hash: string): Route {
  if (/^#ranks\/?$/i.test(hash)) return RANKS
  if (/^#help\/?$/i.test(hash)) return HELP
  if (/^#year\/?$/i.test(hash)) return YEAR
  // A short address to give server admins: Settings → Discord.
  if (/^#discord\/?$/i.test(hash)) return DISCORD
  const era = /^#eras(?:\/([a-z0-9-]+))?\/?$/i.exec(hash)
  if (era) {
    const album = era[1]?.toLowerCase()
    return album && Object.hasOwn(ALBUMS, album) ? eraRoute(album as AlbumId) : ERAS
  }
  if (/^#groups\/?$/i.test(hash)) return GROUPS
  // A group's page: #group/<id>. One that can't be a group's goes to your groups.
  const group = /^#group(?:\/([^/]*))?\/?$/i.exec(hash)
  if (group) {
    const id = group[1]?.toLowerCase() ?? ''
    return GROUP_ID.test(id) ? groupRoute(id) : GROUPS
  }
  // An invite link: #join/<code>. Anything that can't be a code still opens the page, which says so.
  const join = /^#join\/([A-Za-z0-9]{1,64})\/?$/.exec(hash)
  if (join) return { page: 'join', code: join[1].toLowerCase() }
  const match = /^#settings(?:\/([a-z0-9-]+))?\/?$/i.exec(hash)
  return match ? { page: 'settings', section: match[1]?.toLowerCase() ?? null } : HOME
}

/** The route's #hash, '' for the home page. */
export function hashFor(route: Route): string {
  if (route.page === 'ranks' || route.page === 'help' || route.page === 'year') return `#${route.page}`
  if (route.page === 'eras') return `#eras${route.album ? `/${route.album}` : ''}`
  if (route.page === 'groups') return '#groups'
  if (route.page === 'group') return `#group/${route.id}`
  if (route.page === 'join') return `#join/${route.code}`
  return route.page === 'settings' ? `#settings${route.section ? `/${route.section}` : ''}` : ''
}

/** Something that gets a say before the page changes, like a form with unsaved changes. */
export interface LeaveGuard {
  /** True to stop and ask first. */
  blocks: () => boolean
  /** Asks, and calls `proceed` if they choose to leave anyway (after tidying up, so `blocks` is false). */
  ask: (proceed: () => void) => void
}

let route: Route = typeof window !== 'undefined' ? parseRoute(location.hash) : HOME
let guard: LeaveGuard | null = null
const listeners = new Set<() => void>()

// Each page opened here records how many pages deep it is, so leaving goes back past them all.
const depth = (): number => (history.state as { depth?: number } | null)?.depth ?? 0

function update(next: Route) {
  if (hashFor(next) === hashFor(route)) return
  route = next
  listeners.forEach((fn) => fn())
}

function onAddressChange() {
  const next = parseRoute(location.hash)
  if (hashFor(next) === hashFor(route)) return
  if (guard?.blocks()) {
    // Put the page back in the address bar, then ask.
    history.pushState({ depth: depth() + 1 }, '', hashFor(route))
    guard.ask(() => history.back())
    return
  }
  update(next)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onAddressChange)
  window.addEventListener('hashchange', onAddressChange)
}

export function setLeaveGuard(next: LeaveGuard): () => void {
  guard = next
  return () => {
    if (guard === next) guard = null
  }
}

export function navigate(next: Route) {
  const go = () => {
    if (next.page !== 'home') {
      history.pushState({ depth: depth() + 1 }, '', hashFor(next))
      update(next)
    } else if (depth() > 0) {
      // Back to where the first page was opened from, so Back then doesn't reopen it.
      history.go(-depth())
    } else {
      // Arrived straight at a page's address: there's nothing to go back to.
      history.replaceState(null, '', location.pathname + location.search)
      update(HOME)
    }
  }
  if (hashFor(next) === hashFor(route)) return
  if (guard?.blocks()) guard.ask(go)
  else go()
}

/** For a link's onClick: goes there in place, leaving new-tab and new-window clicks to the browser. */
export function followLink(event: MouseEvent, to: Route) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(to)
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => route,
  )
}
