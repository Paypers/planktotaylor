// The service worker: what makes the site installable, and quick to open from the home screen.
// - The page comes from the network first, so a new deploy shows up straight away. Offline, the last
//   copy is used instead.
// - The built files under /assets/ have hashed names and never change, so they come from the cache.
// - Every other request (YouTube, Supabase, fonts, images) goes straight to the network, untouched.
// Served with Cache-Control: no-cache (public/_headers), so a changed copy is picked up on the next visit.

const VERSION = 1
const PAGE_CACHE = `page-v${VERSION}`
const ASSET_CACHE = `assets-v${VERSION}`
/** Built files kept: a deploy has a handful, so this covers several. The oldest go first. */
const MAX_ASSETS = 40

const BASE = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGE_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate' && (url.pathname === BASE || url.pathname === `${BASE}index.html`)) {
    event.respondWith(pageFromNetwork(request))
  } else if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(assetFromCache(request))
  }
})

/** The page and the built files it uses, so it opens offline from the start. */
async function precache() {
  const response = await fetch(BASE, { cache: 'no-cache' })
  if (!isPage(response)) return
  const html = await response.clone().text()
  await (await caches.open(PAGE_CACHE)).put(BASE, response)
  const assets = new Set([...html.matchAll(/["'](\/[^"']*?assets\/[^"']+)["']/g)].map((match) => match[1]))
  await (await caches.open(ASSET_CACHE)).addAll([...assets])
}

async function pageFromNetwork(request) {
  const cache = await caches.open(PAGE_CACHE)
  try {
    const response = await fetch(request)
    if (isPage(response)) await cache.put(BASE, response.clone())
    return response
  } catch {
    return (await cache.match(BASE)) ?? Response.error()
  }
}

async function assetFromCache(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    await trim(cache)
  }
  return response
}

function isPage(response) {
  return response.ok && (response.headers.get('content-type') ?? '').includes('text/html')
}

async function trim(cache) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)))
}

// Daily reminders: the push carries the words (see supabase/functions/send-reminders), this shows them.
self.addEventListener('push', (event) => {
  let message = { title: 'Plank to Taylor', body: "Today's song is waiting." }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    // An empty or unreadable push still reminds.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: `${BASE}icon-192.png`,
      // One at a time: a later reminder replaces an earlier one still showing.
      tag: 'today',
    }),
  )
})

// Tapping it opens the site: the tab that's already open if there is one, a new one if not.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      return open ? open.focus() : self.clients.openWindow(BASE)
    }),
  )
})
