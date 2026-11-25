/**
 * Phone push notifications (Web Push). Works on Android/desktop browsers,
 * and on iPhone once Splitsy is added to the Home Screen (iOS 16.4+).
 */
import { api } from './api'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** 'unsupported' | 'needs-install' | 'off' | 'on' | 'blocked' | 'not-configured' */
export async function pushStatus() {
  if (!api.pushAvailable || !KEY) return 'not-configured'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/splitsy/')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked in your browser settings' : 'Notifications not allowed')
  const reg = (await navigator.serviceWorker.getRegistration('/splitsy/')) || (await navigator.serviceWorker.register('/splitsy/sw.js', { scope: '/splitsy/' }))
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }))
  await api.savePushSubscription(sub)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/splitsy/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await api.deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
}
