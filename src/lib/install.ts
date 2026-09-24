import { useSyncExternalStore } from 'react'

// Adding the site to the home screen. Chrome and Edge (Android, and computers) fire an install event,
// which is held on to here and fired from our own button at a calm moment instead of the browser's
// banner. iPhones and iPads have no such event, so there the site shows the steps instead.
// Imported from main.tsx so the event is caught even if it fires before the page has drawn.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * prompt  the browser can install it: our button calls its prompt
 * steps   iPhone or iPad: show "Tap Share, then Add to Home Screen"
 * null    nothing to offer: already on the home screen, installed, dismissed, or a browser that can't
 */
export type InstallWay = 'prompt' | 'steps' | null

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
function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad. iPads report themselves as Macs, but Macs have no touch screen. */
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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

function installWay(): InstallWay {
  if (dismissed || installed || isStandalone()) return null
  if (held) return 'prompt'
  return isIos() ? 'steps' : null
}

export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    installWay,
    () => null,
  )
}

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
