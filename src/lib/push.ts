import { accountsEnabled, devicePush, loadReminder, removeReminder, saveReminder, type DeviceReminder } from './account'
import { isIos, isStandalone } from './install'

// Daily reminders on this device: the browser's side. The browser gives a push subscription (where its
// push service delivers to), and the account keeps it with the reminder's time and time zone for the
// send-reminders function. See src/lib/reminders.ts for when they go and what they say.

/** The public half of the key reminders are signed with (made by `npm run vapid`). Without it, no reminders. */
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Reminders are set up on this site: accounts, and the key. */
export const remindersAvailable = accountsEnabled && !!VAPID_KEY

/**
 * ready          this device can have reminders
 * install-first  iPhone or iPad in a browser tab: reminders only come to the site on the home screen
 * unsupported    this browser can't take push notifications (or it's a build without the service worker)
 * blocked        notifications are turned off for the site in the browser's settings
 */
export type ReminderSupport = 'ready' | 'install-first' | 'unsupported' | 'blocked'

export async function reminderSupport(): Promise<ReminderSupport> {
  if (isIos() && !isStandalone()) return 'install-first'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  // The service worker delivers them, and it only runs on the built site.
  if (!(await navigator.serviceWorker.getRegistration())) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ready'
}

/** This device's reminder, if it has one. */
export async function thisDeviceReminder(): Promise<DeviceReminder | null> {
  const push = await devicePush()
  return push ? loadReminder(push.endpoint) : null
}

/**
 * Turns reminders on here. Call it straight from the tap: browsers only ask for permission from one.
 * 'denied' when the player says no (or has blocked notifications).
 */
export async function turnOnReminders(reminder: DeviceReminder): Promise<'on' | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const key = keyBytes(VAPID_KEY!)
  let push = await registration.pushManager.getSubscription()
  // One made with another key (the keys were replaced) can't take these reminders: start again.
  if (push && !sameKey(push.options.applicationServerKey, key)) {
    await push.unsubscribe()
    push = null
  }
  push ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await saveReminder(push.toJSON(), reminder)
  return 'on'
}

export async function changeReminder(reminder: DeviceReminder) {
  const push = await devicePush()
  if (!push) throw new Error('Reminders are off on this device')
  await saveReminder(push.toJSON(), reminder)
}

export async function turnOffReminders() {
  const push = await devicePush()
  if (!push) return
  await removeReminder(push.endpoint)
  await push.unsubscribe()
}

/** A base64url key as the bytes the browser wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const bytes = new Uint8Array(a)
  return bytes.every((byte, i) => byte === b[i])
}
