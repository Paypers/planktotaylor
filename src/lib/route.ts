import { useSyncExternalStore, type MouseEvent } from 'react'

// Pages live in the address's #hash, so any static host serves them and Back works.
// Sign-in links use the hash too (#access_token=…): anything that isn't a page here is left alone.

export type Route = { page: 'home' } | { page: 'settings'; section: string | null }

export const HOME: Route = { page: 'home' }

export function parseRoute(hash: string): Route {
  const match = /^#settings(?:\/([a-z0-9-]+))?\/?$/i.exec(hash)
  return match ? { page: 'settings', section: match[1]?.toLowerCase() ?? null } : HOME
}

/** The route's #hash, '' for the home page. */
export function hashFor(route: Route): string {
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
    if (next.page === 'settings') {
      history.pushState({ depth: depth() + 1 }, '', hashFor(next))
      update(next)
    } else if (depth() > 0) {
      // Back to where settings was opened from, so Back then doesn't reopen it.
      history.go(-depth())
    } else {
      // Arrived straight at a settings address: there's nothing to go back to.
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
