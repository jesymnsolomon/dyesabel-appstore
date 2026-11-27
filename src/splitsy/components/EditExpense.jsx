import { useEffect, useState } from 'react'
import { Sheet, Button, Avatar, Segmented } from './ui'
import Icon from './Icon'
import { CategoryPicker, CategoryField } from './CategoryPicker'
import { currencySymbol } from '../lib/currency'
import { firstName } from '../lib/format'

/**
 * Popup for editing a saved transaction's details.
 * Receipts with items: the amount comes from the items (edit those instead).
 */
export default function EditExpense({ open, expense, group, meId, onClose, onSave, saving }) {
  const [d, setD] = useState(null)
  const [catOpen, setCatOpen] = useState(false)
  const settle = expense?.kind === 'settlement'
  const hasItems = expense?.items?.length > 0
  const foreign = Boolean(expense?.original_currency)
  const amtCur = foreign ? expense.original_currency : group?.currency

  useEffect(() => {
    if (open && expense) {
      setD({
        title: expense.title,
        category: expense.category,
        amount: String(foreign ? expense.original_amount : expense.amount),
        paid_by: expense.paid_by,
        payment_method: expense.payment_method,
        channel: expense.channel,
        place_name: expense.place_name || '',
        note: expense.note || '',
      })
    }
  }, [open, expense, foreign])

  if (!open || !d) return null
  const set = (p) => setD((x) => ({ ...x, ...p }))
  const amount = Number(d.amount)
  const valid = d.title.trim() && (hasItems || amount > 0)

  return (
    <Sheet open onClose={onClose} title={settle ? 'Edit settle-up' : 'Edit transaction'}>
      <form onSubmit={(ev) => { ev.preventDefault(); if (valid) onSave(d) }} className="flex flex-col gap-4 pb-2">
        <label className="block">
          <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Name</span>
          <input value={d.title} onChange={(ev) => set({ title: ev.target.value })} className="field mt-1.5" />
        </label>

        {!settle && <CategoryField value={d.category} onClick={() => setCatOpen(true)} />}

        {hasItems ? (
          <div className="rounded-2xl bg-lilac px-4 py-3 text-[13px] font-semibold flex items-start gap-2">
            <Icon name="receipt" size={16} className="text-purple shrink-0 mt-0.5" />
            <span>The amount is the total of the receipt items. Tap an item on the transaction page to change it.</span>
          </div>
        ) : (
          <label className="block">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Amount{foreign ? ` (${amtCur})` : ''}</span>
            <div className="mt-1.5 h-14 rounded-2xl bg-white border-2 border-line flex items-center px-4 gap-1 focus-within:border-ink">
              <span className="font-bold text-ink-faint">{currencySymbol(amtCur)}</span>
              <input inputMode="decimal" value={d.amount} onChange={(ev) => set({ amount: ev.target.value.replace(/[^0-9.]/g, '') })} className="w-full bg-transparent font-display font-bold text-[20px]" />
            </div>
            <span className="block text-[12px] font-semibold text-ink-faint mt-1.5">Everyone’s share is updated to match the new amount.</span>
          </label>
        )}

        <div>
          <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Paid by</span>
          <div className="flex gap-2 mt-1.5 overflow-x-auto no-scrollbar">
            {group.members.map((m) => {
              const on = d.paid_by === m.id
              return (
                <button key={m.id} type="button" onClick={() => set({ paid_by: m.id })} className={`tap shrink-0 flex items-center gap-2 h-11 pl-1.5 pr-3.5 rounded-full border-2 font-bold text-[13px] ${on ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>
                  <Avatar user={m} size={28} /> {m.id === meId ? 'Me' : firstName(m.name)}
                </button>
              )
            })}
          </div>
        </div>

        {/* same gap between rows as between the two buttons in a row */}
        <div className="flex flex-col gap-3">
          <Segmented value={d.payment_method} onChange={(v) => set({ payment_method: v })} options={[{ value: 'cash', label: 'Cash', icon: 'cash' }, { value: 'card', label: 'Card', icon: 'card' }]} />
          {!settle && <Segmented value={d.channel} onChange={(v) => set({ channel: v })} options={[{ value: 'in_person', label: 'In person', icon: 'store' }, { value: 'online', label: 'Online', icon: 'globe' }]} />}
        </div>

        {!settle && (
          <label className="block">
            <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Place</span>
            <input value={d.place_name} onChange={(ev) => set({ place_name: ev.target.value })} placeholder="Where was it?" className="field mt-1.5" />
          </label>
        )}
        <label className="block">
          <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Note</span>
          <input value={d.note} onChange={(ev) => set({ note: ev.target.value })} placeholder="Optional" className="field mt-1.5" />
        </label>

        <div className="flex gap-2 mt-1">
          <Button type="button" variant="muted" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="dark" className="flex-[1.4]" disabled={!valid} loading={saving}><Icon name="check" size={18} stroke={2.8} /> Save changes</Button>
        </div>
      </form>
      <CategoryPicker open={catOpen} onClose={() => setCatOpen(false)} value={d.category} onPick={(c) => set({ category: c })} />
    </Sheet>
  )
}
