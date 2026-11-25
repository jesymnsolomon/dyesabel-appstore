import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './lib/api'

const AuthCtx = createContext({ user: null, ready: false, setUser: () => {} })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    api.getUser().then((u) => {
      if (!alive) return
      setUser(u)
      setReady(true)
    }).catch(() => setReady(true))
    const off = api.onAuthChange((u) => alive && setUser(u))
    return () => { alive = false; off() }
  }, [])

  return <AuthCtx.Provider value={{ user, ready, setUser }}>{children}</AuthCtx.Provider>
}

const PENDING = 'splitsy:pendingJoin'
export const setPendingJoin = (code) => localStorage.setItem(PENDING, code)
export const takePendingJoin = () => {
  const c = localStorage.getItem(PENDING)
  localStorage.removeItem(PENDING)
  return c
}
