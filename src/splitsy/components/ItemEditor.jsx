import { useEffect, useState } from 'react'
import { Sheet, Button, Avatar } from './ui'
import Icon from './Icon'
import { money, firstName } from '../lib/format'

/**
 * Popup for editing one receipt item: name, quantity, price, include/exclude, delete.
 * `item` null = closed. An item with `isNew` shows "Add item".
 * Pass `members` to also pick who had the item (saved transactions).
 */
export default function ItemEditor({ item, currency, symbol, onSave, onDelete, onClose, hideInclude = false, saving = false, members = null, meId, defaultPeople }) {
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (item) {
      const all = members?.map((m) => m.id) || []
      const people = Array.isArray(item.people) && item.people.length ? item.people : defaultPeople?.length ? defaultPeople : all
      setDraft({ name: item.name || '', qty: String(item.qty || 1), price: item.price === '' || item.price == null ? '' : String(item.price), checked: item.checked !== false, people: people.filter((id) => all.includes(id)) })
    }
  }, [item]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!item || !draft) return null
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const qty = Math.max(1, parseInt(draft.qty, 10) || 1)
  const price = Number(draft.price)
  const pickPeople = Boolean(members?.length) && !item.shared
  const valid = draft.name.trim() && draft.price !== '' && !Number.isNaN(price) && price !== 0 && (!pickPeople || draft.people.length > 0)
  const priceChanged = item.discount > 0 && price !== Number(item.price)

  const save = () => {
    if (!valid) return
    const patch = { name: draft.name.trim(), qty, price: Math.round(price * 100) / 100, checked: draft.checked, fresh: false }
    if (priceChanged) Object.assign(patch, { discount: 0, original: undefined })
    if (pickPeople) patch.people = draft.people
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
          <div className="block w-[132px] shrink-0">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Qty</span>
            <div className="mt-1.5 h-14 rounded-2xl bg-cream flex items-center justify-between px-1.5">
              <button type="button" disabled={qty <= 1} onClick={() => set({ qty: String(Math.max(1, qty - 1)) })} className="tap w-10 h-10 rounded-xl bg-white text-ink grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,0.07)] disabled:opacity-35 disabled:shadow-none" aria-label="Less"><Icon name="minus" size={18} stroke={2.8} /></button>
              <input inputMode="numeric" aria-label="Quantity" value={draft.qty} onChange={(e) => set({ qty: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="w-full min-w-0 text-center font-display font-extrabold text-[20px] bg-transparent" />
              <button type="button" onClick={() => set({ qty: String(qty + 1) })} className="tap w-10 h-10 rounded-xl bg-ink text-white grid place-items-center" aria-label="More"><Icon name="plus" size={18} stroke={2.8} /></button>
            </div>
          </div>
          <label className="block flex-1">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Line total</span>
            <div className="mt-1.5 h-14 rounded-2xl bg-cream border-2 border-transparent flex items-center px-4 gap-1 focus-within:border-ink focus-within:bg-white transition-colors">
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

        {pickPeople && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Who had this?</span>
              <button type="button" onClick={() => set({ people: draft.people.length === members.length ? [] : members.map((m) => m.id) })} className={`tap h-8 px-3 rounded-full text-[12px] font-bold border-2 ${draft.people.length === members.length ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>
                {draft.people.length === members.length ? 'Everyone' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-3 mt-3">
              {members.map((m) => {
                const on = draft.people.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => set({ people: on ? draft.people.filter((x) => x !== m.id) : [...draft.people, m.id] })} className="tap flex flex-col items-center gap-1 w-[64px]" aria-pressed={on} aria-label={m.name}>
                    <span className="relative p-[3px]">
                      <span className={`block rounded-full ring-[3px] transition-all ${on ? 'ring-green' : 'ring-transparent opacity-35 grayscale'}`}><Avatar user={m} size={50} /></span>
                      {on && <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-green text-white grid place-items-center ring-2 ring-white"><Icon name="check" size={11} stroke={3.2} /></span>}
                    </span>
                    <span className={`text-[11px] font-bold truncate max-w-full ${on ? '' : 'text-ink-faint'}`}>{m.id === meId ? 'Me' : firstName(m.name)}</span>
                  </button>
                )
              })}
            </div>
            <p className={`text-[12px] font-semibold mt-2 ${draft.people.length ? 'text-ink-faint' : 'text-orange font-bold'}`}>
              {!draft.people.length ? 'Pick who had this' : draft.people.length > 1 && price > 0 ? `${money(price / draft.people.length, currency, { decimals: true })} each` : draft.people.length === 1 ? 'Just one person pays for this' : ''}
            </p>
          </div>
        )}

        {!hideInclude && <button type="button" onClick={() => set({ checked: !draft.checked })} className="tap flex items-center gap-3 bg-white rounded-2xl border-2 border-line p-3 text-left">
          <span className={`w-7 h-7 rounded-lg grid place-items-center border-2 shrink-0 ${draft.checked ? 'bg-green border-green text-white' : 'border-line'}`}>{draft.checked && <Icon name="check" size={15} stroke={3} />}</span>
          <span className="flex-1">
            <span className="block font-bold text-[14px]">Include in this split</span>
            <span className="block text-[12px] font-semibold text-ink-faint">Untick for things that aren’t shared</span>
          </span>
        </button>}

        <div className="flex gap-2 mt-1">
          {!item.isNew && (
            <Button type="button" variant="danger" className="w-14 !px-0" onClick={onDelete} aria-label="Delete item"><Icon name="trash" size={19} /></Button>
          )}
          <Button type="button" variant="muted" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="dark" className="flex-[1.4]" disabled={!valid} loading={saving}><Icon name="check" size={18} stroke={2.8} /> {item.isNew ? 'Add' : 'Save'}</Button>
        </div>
      </form>
    </Sheet>
  )
}
