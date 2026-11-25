// Minimal service worker for Splitsy: makes it installable and caches the app shell.
const CACHE = 'splitsy-v1'
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
