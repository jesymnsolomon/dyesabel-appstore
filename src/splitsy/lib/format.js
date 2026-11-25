export const CURRENCIES = {
  PHP: { symbol: '₱', locale: 'en-PH' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  KRW: { symbol: '₩', locale: 'ko-KR' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
}

export const toCents = (n) => Math.round(Number(n || 0) * 100)
export const fromCents = (c) => Math.round(c) / 100

export function money(amount, currency = 'PHP', opts = {}) {
  const c = CURRENCIES[currency] || CURRENCIES.PHP
  const n = Number(amount || 0)
  const compact = opts.compact && Math.abs(n) >= 10000
  const body = compact
    ? new Intl.NumberFormat(c.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : new Intl.NumberFormat(c.locale, {
        minimumFractionDigits: Number.isInteger(n) && !opts.decimals ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(n))
  return `${n < 0 && !compact ? '-' : ''}${c.symbol}${body}`
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
