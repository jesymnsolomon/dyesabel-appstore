import { currencySymbol } from './currency'

export const toCents = (n) => Math.round(Number(n || 0) * 100)
export const fromCents = (c) => Math.round(c) / 100

const digitsCache = {}
function fractionDigits(code) {
  if (digitsCache[code] != null) return digitsCache[code]
  let d = 2
  try { d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits } catch { /* ignore */ }
  return (digitsCache[code] = d)
}

/** Formats any currency: ₱1,250 · $25.50 · ¥3,000 · CHF 12.40 */
export function money(amount, currency = 'PHP', opts = {}) {
  const n = Number(amount || 0)
  const sym = currencySymbol(currency)
  const digits = fractionDigits(currency)
  const compact = opts.compact && Math.abs(n) >= 10000
  const body = compact
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(n))
    : new Intl.NumberFormat('en-US', {
        minimumFractionDigits: Number.isInteger(n) && !opts.decimals ? 0 : digits,
        maximumFractionDigits: digits,
      }).format(Math.abs(n))
  const gap = /[A-Za-z]$/.test(sym) ? ' ' : ''
  return `${n < 0 ? '-' : ''}${sym}${gap}${body}`
}

export function dateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function fullDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function relDay(iso) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(); y.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'friend'
