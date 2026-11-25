import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './lib/api'
import { useAuth } from './auth'
import { useToast } from './components/ui'

const Ctx = createContext({ items: [], unread: 0, refresh: () => {}, markRead: () => {} })
export const useNotifications = () => useContext(Ctx)

/** Loads my notifications, listens for new ones live, and pops a message when one arrives. */
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])

  const refresh = useCallback(async () => {
    if (!user) return setItems([])
    try { setItems(await api.listNotifications()) } catch { /* offline */ }
  }, [user])

  useEffect(() => {
    if (!user) { setItems([]); return }
    refresh()
    const off = api.subscribeNotifications(user.id, (n) => {
      toast(n.title)
      refresh()
    })
    // catch up when the app comes back to the foreground
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => { off(); document.removeEventListener('visibilitychange', onVisible) }
  }, [user, refresh, toast])

  const markRead = useCallback(async (ids) => {
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (!n.read_at && (!ids?.length || ids.includes(n.id)) ? { ...n, read_at: now } : n)))
    try { await api.markNotificationsRead(ids) } catch { /* will sync later */ }
  }, [])

  const unread = items.filter((n) => !n.read_at).length
  return <Ctx.Provider value={{ items, unread, refresh, markRead }}>{children}</Ctx.Provider>
}
