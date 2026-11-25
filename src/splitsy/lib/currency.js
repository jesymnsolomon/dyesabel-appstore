/**
 * Currencies + live exchange rates.
 * - The list of every currency comes from the browser itself (Intl), so it's always complete.
 * - Rates come from open.er-api.com (free, no key, ~160 currencies, updated daily)
 *   and are cached on the phone for 6 hours.
 */

export const POPULAR = ['PHP', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'HKD', 'THB', 'VND', 'MYR', 'IDR', 'TWD', 'CNY', 'AUD', 'GBP', 'CAD', 'AED', 'SAR']

const FALLBACK = [...POPULAR, 'NZD', 'CHF', 'INR', 'QAR', 'KWD', 'SEK', 'NOK', 'DKK', 'MOP', 'BND', 'KHR', 'LAK', 'MMK', 'NPR', 'LKR', 'PKR', 'BDT', 'TRY', 'ZAR', 'BRL', 'MXN']

let cached = null

/** Every currency the browser knows: [{ code, name, symbol }] */
export function allCurrencies() {
  if (cached) return cached
  let codes = FALLBACK
  try {
    if (Intl.supportedValuesOf) codes = Intl.supportedValuesOf('currency')
  } catch { /* old browser */ }
  let names = null
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }) } catch { /* ignore */ }
  cached = codes
    .map((code) => ({ code, name: names?.of(code) || code, symbol: currencySymbol(code) }))
    .filter((c) => c.name && !/\(\d{4}/.test(c.name)) // drop historic currencies like "(1946–1961)"
    .sort((a, b) => a.name.localeCompare(b.name))
  return cached
}

const symCache = {}
export function currencySymbol(code) {
  if (symCache[code]) return symCache[code]
  let s = code
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    s = parts.find((p) => p.type === 'currency')?.value || code
  } catch { /* unknown */ }
  if (code === 'PHP') s = '₱'
  return (symCache[code] = s)
}

export const currencyName = (code) => allCurrencies().find((c) => c.code === code)?.name || code

// ---------------- rates ----------------
const KEY = 'splitsy:rates'
const MAX_AGE = 6 * 60 * 60 * 1000
let inflight = null

/** Rates relative to USD: { base:'USD', rates:{ PHP: 58.1, ... }, updated } */
export async function getRates({ force = false } = {}) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!force && saved && Date.now() - saved.fetched < MAX_AGE) return saved
  } catch { /* ignore */ }
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD')
        const j = await res.json()
        if (j.result !== 'success') throw new Error('Rates unavailable')
        const data = { base: 'USD', rates: j.rates, updated: j.time_last_update_utc, fetched: Date.now() }
        try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* full */ }
        return data
      } catch (e) {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
        if (saved) return { ...saved, stale: true }
        throw new Error('Can’t get exchange rates right now. Check your internet.')
      } finally {
        inflight = null
      }
    })()
  }
  return inflight
}

/** How many `to` you get for 1 `from`. */
export function rateBetween(rates, from, to) {
  if (from === to) return 1
  const f = rates?.rates?.[from]
  const t = rates?.rates?.[to]
  if (!f || !t) return null
  return t / f
}

export const round2 = (n) => Math.round(n * 100) / 100

/** "₱0.3900", "$0.01709", "¥150.00": enough precision for small rates. */
export function formatRate(rate, code) {
  if (!rate) return '—'
  const n = rate >= 100 ? rate.toFixed(2) : rate >= 1 ? rate.toFixed(4) : Number(rate.toPrecision(4)).toString()
  const sym = currencySymbol(code)
  return `${sym}${/[A-Za-z]$/.test(sym) ? ' ' : ''}${n}`
}

/** Rounds to a friendly number: 3.4 → 3, 17 → 20, 1712 → 1700 */
export function niceNumber(x) {
  if (x <= 0) return 0
  const p = 10 ** Math.floor(Math.log10(x))
  const f = x / p
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10
  return Math.round(nice * p * 100) / 100
}
