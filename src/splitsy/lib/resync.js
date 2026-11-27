// "Resync app": make sure this phone runs the newest version and fresh data.
// Clears Splitsy's saved app files, asks the service worker to update, then
// reloads. Accounts, groups, bills and phone notifications are not touched
// (they live on the server / in the push subscription, not in these caches).

export const BUILD = typeof __SPLITSY_BUILD__ !== 'undefined' ? __SPLITSY_BUILD__ : null // eslint-disable-line no-undef

export async function resyncApp() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('splitsy')).map((k) => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/splitsy/')
      if (reg) {
        await reg.update().catch(() => {})
        reg.waiting?.postMessage?.({ type: 'SKIP_WAITING' })
      }
    }
  } catch {
    // reloading below still picks up the latest version in most cases
  }
  // cache-busting reload of the app page (keeps the current screen)
  const url = new URL(window.location.href)
  url.searchParams.set('v', Date.now().toString(36))
  window.location.replace(url.toString())
}

export function buildLabel() {
  if (!BUILD) return 'Development version'
  return new Date(BUILD).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
