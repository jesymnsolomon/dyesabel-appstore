import { useEffect, useState } from 'react'
import { Sheet, Button } from './ui'
import Icon from './Icon'
import { money } from '../lib/format'

/**
 * Popup for editing one receipt item: name, quantity, price, include/exclude, delete.
 * `item` null = closed. An item with `isNew` shows "Add item".
 */
export default function ItemEditor({ item, currency, symbol, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (item) setDraft({ name: item.name || '', qty: String(item.qty || 1), price: item.price === '' || item.price == null ? '' : String(item.price), checked: item.checked !== false })
  }, [item])
  if (!item || !draft) return null
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const qty = Math.max(1, parseInt(draft.qty, 10) || 1)
  const price = Number(draft.price)
  const valid = draft.name.trim() && draft.price !== '' && !Number.isNaN(price) && price !== 0
  const priceChanged = item.discount > 0 && price !== Number(item.price)

  const save = () => {
    if (!valid) return
    const patch = { name: draft.name.trim(), qty, price: Math.round(price * 100) / 100, checked: draft.checked, fresh: false }
    if (priceChanged) Object.assign(patch, { discount: 0, original: undefined })
    onSave(patch)
  }

  return (
    <Sheet open onClose={onClose} title={item.isNew ? 'Add item' : 'Edit item'}>
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-4 pb-2">
        <label className="block">
          <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Item name</span>
          <input autoFocus={item.isNew} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Kare-Kare" className="field mt-1.5" />
        </label>

        <div className="flex gap-3">
          <label className="block w-28 shrink-0">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Qty</span>
            <div className="mt-1.5 h-14 rounded-2xl bg-white border-2 border-line flex items-center">
              <button type="button" onClick={() => set({ qty: String(Math.max(1, qty - 1)) })} className="tap w-9 h-full grid place-items-center text-ink-soft text-[20px] font-bold" aria-label="Less">−</button>
              <input inputMode="numeric" value={draft.qty} onChange={(e) => set({ qty: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="w-full min-w-0 text-center font-bold text-[16px] bg-transparent" />
              <button type="button" onClick={() => set({ qty: String(qty + 1) })} className="tap w-9 h-full grid place-items-center text-ink-soft text-[20px] font-bold" aria-label="More">+</button>
            </div>
          </label>
          <label className="block flex-1">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Line total</span>
            <div className="mt-1.5 h-14 rounded-2xl bg-white border-2 border-line flex items-center px-4 gap-1 focus-within:border-ink">
              <span className="font-bold text-ink-faint">{symbol}</span>
              <input inputMode="decimal" value={draft.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9.-]/g, '') })} placeholder="0.00" className="w-full bg-transparent font-display font-bold text-[20px]" />
            </div>
          </label>
        </div>
        {qty > 1 && price > 0 && <p className="text-[13px] font-semibold text-ink-soft -mt-2">{money(price / qty, currency, { decimals: true })} each</p>}

        {item.discount > 0 && !priceChanged && (
          <div className="rounded-2xl bg-mint px-4 py-3 text-[13px] font-semibold flex items-start gap-2">
            <Icon name="percent" size={16} className="text-green shrink-0 mt-0.5" />
            <span>Discount already applied: {money(item.original, currency, { decimals: true })} − {money(item.discount, currency, { decimals: true })} = <b>{money(item.price, currency, { decimals: true })}</b></span>
          </div>
        )}

        <button type="button" onClick={() => set({ checked: !draft.checked })} className="tap flex items-center gap-3 bg-white rounded-2xl border-2 border-line p-3 text-left">
          <span className={`w-7 h-7 rounded-lg grid place-items-center border-2 shrink-0 ${draft.checked ? 'bg-green border-green text-white' : 'border-line'}`}>{draft.checked && <Icon name="check" size={15} stroke={3} />}</span>
          <span className="flex-1">
            <span className="block font-bold text-[14px]">Include in this split</span>
            <span className="block text-[12px] font-semibold text-ink-faint">Untick for things that aren’t shared</span>
          </span>
        </button>

        <div className="flex gap-2 mt-1">
          {!item.isNew && (
            <Button type="button" variant="danger" className="w-14 !px-0" onClick={onDelete} aria-label="Delete item"><Icon name="trash" size={19} /></Button>
          )}
          <Button type="button" variant="soft" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="dark" className="flex-[1.4]" disabled={!valid}><Icon name="check" size={18} stroke={2.8} /> {item.isNew ? 'Add' : 'Save'}</Button>
        </div>
      </form>
    </Sheet>
  )
}
