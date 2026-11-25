import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui'
import Icon from './Icon'
import { allCurrencies, POPULAR, currencySymbol, getRates } from '../lib/currency'

/** Bottom sheet with every currency, searchable by code, name or symbol. */
export function CurrencyPicker({ open, onClose, value, onPick, title = 'Choose a currency', note }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => allCurrencies(), [])
  const query = q.trim().toLowerCase()
  const filtered = query
    ? list.filter((c) => c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query) || c.symbol.toLowerCase() === query)
    : list
  const popular = query ? [] : POPULAR.map((code) => list.find((c) => c.code === code)).filter(Boolean)

  const pick = (code) => {
    onPick(code)
    setQ('')
    onClose()
  }

  const Row = ({ c }) => (
    <button onClick={() => pick(c.code)} className={`tap w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left ${value === c.code ? 'bg-ink text-white' : ''}`}>
      <span className={`w-9 h-9 rounded-full grid place-items-center font-display font-bold text-[13px] shrink-0 ${value === c.code ? 'bg-white/15' : 'bg-cream'}`}>{c.symbol.length > 3 ? c.code.slice(0, 2) : c.symbol}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[15px] truncate">{c.name}</span>
        <span className={`block text-[12px] font-semibold ${value === c.code ? 'text-white/60' : 'text-ink-faint'}`}>{c.code}</span>
      </span>
      <span className={`font-display font-bold text-[16px] ${value === c.code ? '' : 'text-ink-soft'}`}>{c.symbol}</span>
      {value === c.code && <Icon name="check" size={18} stroke={3} />}
    </button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {note && <p className="text-[13px] font-semibold text-ink-soft -mt-2 mb-3">{note}</p>}
      <div className="sticky top-0 bg-paper pb-2 z-10">
        <div className="relative">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: yen, USD, euro…" className="field pl-11" />
        </div>
      </div>
      {popular.length > 0 && (
        <>
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint px-3 mt-2 mb-1">Popular</p>
          {popular.map((c) => <Row key={`p-${c.code}`} c={c} />)}
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint px-3 mt-4 mb-1">All currencies · {list.length}</p>
        </>
      )}
      {filtered.map((c) => <Row key={c.code} c={c} />)}
      {filtered.length === 0 && <p className="text-center text-ink-soft font-semibold py-8">No currency matches “{q}”</p>}
      <div className="h-4" />
    </Sheet>
  )
}

/** Small pill showing a currency, e.g. PHP ▾ */
export function CurrencyChip({ code, onClick, dark = false, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={`tap inline-flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-full font-bold text-[13px] ${dark ? 'bg-white/25 text-white backdrop-blur' : 'bg-white border-2 border-line'} ${className}`}>
      <span className={`min-w-6 h-6 px-1 rounded-full grid place-items-center text-[11px] font-display font-extrabold ${dark ? 'bg-white/30' : 'bg-cream'}`}>{currencySymbol(code).length > 3 ? code.slice(0, 1) : currencySymbol(code)}</span>
      {code}
      <Icon name="chevronDown" size={14} stroke={2.6} />
    </button>
  )
}

/** Live exchange rates (cached). */
export function useRates(enabled = true) {
  const [state, setState] = useState({ rates: null, error: null, loading: enabled })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    getRates()
      .then((rates) => alive && setState({ rates, error: null, loading: false }))
      .catch((e) => alive && setState({ rates: null, error: e.message, loading: false }))
    return () => { alive = false }
  }, [enabled])
  return state
}

/** A remembered "view in" currency (per screen key). */
export function useViewCurrency(key, fallback) {
  const storageKey = `splitsy:view:${key}`
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem(storageKey) || fallback } catch { return fallback }
  })
  useEffect(() => { if (!code && fallback) setCode(fallback) }, [fallback, code])
  const set = (c) => {
    setCode(c)
    try { localStorage.setItem(storageKey, c) } catch { /* ignore */ }
  }
  return [code || fallback, set]
}
