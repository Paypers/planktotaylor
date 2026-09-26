import { useSyncExternalStore } from 'react'
import { deviceOf } from './installGuide'

// Adding the site to the home screen, which is the app: there's none in the app stores. Chrome and
// Edge (Android, and computers) fire an install event, which is held on to here and fired from our own
// button at a calm moment instead of the browser's banner. Elsewhere the site shows the steps instead.
// Imported from main.tsx so the event is caught even if it fires before the page has drawn.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * prompt  the browser can install it: our button calls its prompt
 * steps   a phone or tablet without the event: point to the steps for its browser
 * null    nothing to offer: already on the home screen, installed, dismissed, or a computer without the event
 */
export type InstallWay = 'prompt' | 'steps' | null

/**
 * standalone  opened from the home screen
 * installed   installed just now, from the browser's own dialog
 * prompt      the browser can install it in one tap
 * by-hand     it takes the browser's menus: the steps for this one
 */
export type InstallStatus = 'standalone' | 'installed' | 'prompt' | 'by-hand'

const DISMISSED_KEY = 'plank-to-taylor:install-dismissed'

let held: InstallPromptEvent | null = null
let installed = false
let dismissed = readDismissed()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null
  } catch {
    return false
  }
}

/** Opened from the home screen, or as an installed app. */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad. */
export function isIos(): boolean {
  const device = deviceOf(navigator)
  return device === 'iphone' || device === 'ipad'
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    held = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    held = null
    installed = true
    notify()
  })
}

function installStatus(): InstallStatus {
  if (isStandalone()) return 'standalone'
  if (installed) return 'installed'
  return held ? 'prompt' : 'by-hand'
}

// The home page's offer. Not now hides it, but never the guide page, which people open themselves.
function installWay(): InstallWay {
  if (dismissed) return null
  const status = installStatus()
  if (status === 'prompt') return 'prompt'
  return status === 'by-hand' && deviceOf(navigator) !== 'computer' ? 'steps' : null
}

function useInstallStore<T>(read: () => T, onServer: T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    read,
    () => onServer,
  )
}

export const useInstallWay = () => useInstallStore(installWay, null)
export const useInstallStatus = () => useInstallStore(installStatus, 'by-hand')

/** Not now: remembered in this browser, so it isn't offered again. */
export function dismissInstall() {
  dismissed = true
  try {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString())
  } catch {
    // Private mode: it's offered again next visit.
  }
  notify()
}

/** The browser's own install dialog. Declining it counts as Not now. */
export async function promptInstall() {
  const event = held
  if (!event) return
  held = null // Each event can only prompt once.
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'dismissed') dismissInstall()
}
