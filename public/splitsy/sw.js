// Minimal service worker for Splitsy: makes it installable and caches the app shell.
const CACHE = 'splitsy-v3'
const SHELL = ['/splitsy/', '/apps/splitsy/icon-192.png', '/apps/splitsy/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  // Network first for pages, cache first for static assets.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/splitsy/')))
    return
  }
  if (url.pathname.startsWith('/apps/splitsy/') || url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
  }
})

// ---- Push notifications ----
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'Splitsy', body: e.data?.text() } }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Splitsy', {
      body: data.body || '',
      icon: '/apps/splitsy/icon-192.png',
      badge: '/apps/splitsy/favicon-64.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/splitsy/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/splitsy/', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes('/splitsy/'))
      if (open) {
        open.navigate(url)
        return open.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})

// "Resync app" in Profile asks a freshly downloaded version to take over right away
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
