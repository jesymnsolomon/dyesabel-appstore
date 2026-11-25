import { useEffect, useState } from 'react'

/**
 * Tiny hash router (no extra dependency). Works on any static host and keeps
 * share links simple: /splitsy/#/join/ABCD2345
 */
const read = () => window.location.hash.replace(/^#/, '') || '/'

export function useRoute() {
  const [path, setPath] = useState(read)
  useEffect(() => {
    const on = () => {
      setPath(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function navigate(to, { replace = false } = {}) {
  if (replace) window.location.replace(`#${to}`)
  else window.location.hash = to
}

export const back = (fallback = '/') => {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback, { replace: true })
}

/** match('/group/:id', '/group/42') → { id: '42' } */
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean)
  const a = path.split('?')[0].split('/').filter(Boolean)
  if (p.length !== a.length) return null
  const params = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

export const inviteLink = (code) => `${window.location.origin}/splitsy/#/join/${code}`
