import { useEffect, useMemo, useState } from 'react'
import { Sheet, Button, Avatar } from './ui'
import Icon from './Icon'
import ItemAssign from './ItemAssign'
import { equalSplit, itemSplits, rescaleSplits } from '../lib/balances'
import { currencySymbol } from '../lib/currency'
import { money, firstName, toCents, fromCents } from '../lib/format'

const MODES = [['equal', 'Equally'], ['fixed', 'Fixed + rest'], ['custom', 'Custom']]

/**
 * Popup for changing who shares a saved transaction, and how.
 * Shares are in the group's currency (that's what balances use).
 * Receipts with items can also be split by item again.
 */
export default function SplitEditor({ open, expense, group, meId, onClose, onSave, saving }) {
  const members = group?.members || []
  const everyone = useMemo(() => members.map((m) => m.id), [members])
  const cur = group?.currency
  const sym = currencySymbol(cur)
  const total = Number(expense?.amount) || 0
  const hasItems = expense?.items?.length > 0
  const itemCur = expense?.original_currency || cur
  const modes = hasItems ? [['items', 'By item'], ...MODES] : MODES

  const [mode, setMode] = useState('equal')
  const [people, setPeople] = useState([])
  const [custom, setCustom] = useState({})
  const [fixed, setFixed] = useState({})
  const [items, setItems] = useState([])

  // start from how the bill is split right now
  useEffect(() => {
    if (!open || !expense) return
    const current = (expense.splits || []).filter((s) => Number(s.amount) !== 0)
    const ids = current.map((s) => s.user_id).filter((id) => everyone.includes(id))
    setPeople(ids.length ? ids : everyone)
    setCustom(Object.fromEntries(current.map((s) => [s.user_id, String(s.amount)])))
    setFixed({})
    setItems((expense.items || []).map((it, k) => ({ ...it, id: k })))
    const m = expense.split_mode
    setMode(m === 'items' && hasItems ? 'items' : m === 'equal' ? 'equal' : 'custom')
  }, [open, expense, everyone, hasItems])

  const fixedInfo = useMemo(() => {
    const totalC = toCents(total)
    const fixedC = {}
    let sum = 0
    for (const id of people) {
      const f = fixed[id]
      if (!f) continue
      const v = Number(f.value) || 0
      const c = f.type === 'percent' ? Math.round((totalC * v) / 100) : toCents(v)
      fixedC[id] = c
      sum += c
    }
    const equalIds = people.filter((id) => !(id in fixedC))
    return { fixedC, sum: fromCents(sum), rest: fromCents(totalC - sum), equalIds }
  }, [people, fixed, total])

  const splits = useMemo(() => {
    if (mode === 'items') {
      const inItemCur = itemSplits(items.map((i) => ({ ...i, price: Number(i.price) })), everyone)
      return itemCur === cur ? inItemCur : rescaleSplits(inItemCur, total)
    }
    if (mode === 'equal') return equalSplit(total, people)
    if (mode === 'fixed') {
      const list = Object.entries(fixedInfo.fixedC).map(([user_id, c]) => ({ user_id, amount: fromCents(c) }))
      if (fixedInfo.rest > 0 && fixedInfo.equalIds.length) list.push(...equalSplit(fixedInfo.rest, fixedInfo.equalIds))
      return list
    }
    return people.map((id) => ({ user_id: id, amount: Number(custom[id]) || 0 }))
  }, [mode, items, everyone, itemCur, cur, total, people, fixedInfo, custom])

  if (!open || !expense) return null

  const remaining = fromCents(toCents(total) - splits.reduce((t, s) => t + toCents(s.amount), 0))
  const itemsOk = items.every((i) => i.shared || !Array.isArray(i.people) || i.people.length > 0)
  const valid =
    mode === 'items' ? itemsOk && splits.length > 0
      : mode === 'fixed' ? people.length > 0 && fixedInfo.rest >= 0 && (fixedInfo.rest === 0 || fixedInfo.equalIds.length > 0)
        : people.length > 0 && Math.abs(remaining) < 0.005
  const nameOf = (m) => (m.id === meId ? 'Me' : firstName(m.name))

  const save = () => {
    if (!valid) return
    onSave({
      split_mode: mode,
      splits: splits.filter((s) => Number(s.amount) !== 0),
      ...(mode === 'items' && {
        items: items.map(({ id, ...it }) => (it.shared ? it : { ...it, people: Array.isArray(it.people) && it.people.length ? it.people : everyone })),
      }),
    })
  }

  return (
    <Sheet open onClose={onClose} title="Who’s paying for this?" tall>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex bg-white rounded-full p-1 border-2 border-line">
          {modes.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={`flex-1 h-10 rounded-full font-bold text-[13px] whitespace-nowrap transition-colors ${mode === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[13px] font-semibold text-ink-soft -mt-1 px-1">
          {mode === 'items' ? 'Tap faces to say who shared each item.' : mode === 'equal' ? 'Tap people to include or remove them.' : mode === 'fixed' ? 'Set a fixed amount or % for some people. The rest is split equally.' : 'Type how much each person owes.'}
        </p>

        {mode === 'items' && (
          <>
            <ItemAssign items={items} members={members} me={meId} cur={itemCur} everyone={everyone} onChange={(id, ppl) => setItems((list) => list.map((it) => (it.id === id ? { ...it, people: ppl } : it)))} />
            <div className="card p-4">
              <p className="font-display font-bold text-[16px] mb-3">Each person pays</p>
              <div className="flex flex-col gap-2.5">
                {members.map((m) => {
                  const amt = splits.find((x) => x.user_id === m.id)?.amount || 0
                  return (
                    <div key={m.id} className={`flex items-center gap-3 ${amt ? '' : 'opacity-40'}`}>
                      <Avatar user={m} size={32} />
                      <span className="flex-1 font-bold text-[14px]">{nameOf(m)}</span>
                      <span className="font-display font-bold text-[16px]">{money(amt, cur, { decimals: true })}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {mode !== 'items' && (
          <div className="grid grid-cols-2 gap-3">
            {members.map((m) => {
              const on = people.includes(m.id)
              const share = splits.find((x) => x.user_id === m.id)?.amount || 0
              const f = fixed[m.id]
              const toggle = () => setPeople(on ? people.filter((x) => x !== m.id) : [...people, m.id])
              return (
                <div key={m.id} className={`card px-3 pt-4 pb-3 flex flex-col items-center text-center border-[3px] transition-all ${on ? 'border-green' : 'border-transparent'}`}>
                  <button type="button" onClick={toggle} className="tap flex flex-col items-center gap-2 w-full" aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${m.name}`}>
                    <span className="relative p-1">
                      <span className={`block rounded-full transition-all ${on ? '' : 'opacity-40 grayscale'}`}><Avatar user={m} size={56} /></span>
                      <span className={`absolute right-0 bottom-0 w-7 h-7 rounded-full grid place-items-center ring-[3px] ring-white transition-colors ${on ? 'bg-green text-white' : 'bg-line text-ink-soft'}`}>
                        <Icon name={on ? 'check' : 'plus'} size={15} stroke={3} />
                      </span>
                    </span>
                    <span className={`font-bold text-[14px] truncate max-w-full ${on ? '' : 'text-ink-faint'}`}>{nameOf(m)}</span>
                  </button>
                  {m.is_placeholder && <span className="text-[10px] font-bold text-ink-faint -mt-1">not joined yet</span>}
                  {!on && <span className="text-[12px] font-semibold text-ink-faint mt-1">Tap to add</span>}

                  {on && mode === 'equal' && <span className="font-display font-bold text-[17px] mt-1">{money(share, cur, { decimals: true })}</span>}

                  {on && mode === 'custom' && (
                    <div className="mt-2 w-full flex items-center gap-1 bg-cream rounded-xl px-3 h-11">
                      <span className="text-ink-faint font-bold">{sym}</span>
                      <input inputMode="decimal" placeholder="0" value={custom[m.id] ?? ''} onChange={(ev) => setCustom({ ...custom, [m.id]: ev.target.value.replace(/[^0-9.]/g, '') })} className="w-full min-w-0 bg-transparent font-bold text-right text-[15px]" />
                    </div>
                  )}

                  {on && mode === 'fixed' && (f ? (
                    <div className="mt-2 w-full flex flex-col gap-1.5">
                      <div className="flex bg-cream rounded-xl p-0.5">
                        {[['amount', sym], ['percent', '%']].map(([t, l]) => (
                          <button key={t} type="button" onClick={() => setFixed({ ...fixed, [m.id]: { ...f, type: t } })} className={`flex-1 h-8 rounded-lg text-[13px] font-bold ${f.type === t ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
                        ))}
                      </div>
                      <input autoFocus inputMode="decimal" placeholder="0" value={f.value} onChange={(ev) => setFixed({ ...fixed, [m.id]: { ...f, value: ev.target.value.replace(/[^0-9.]/g, '') } })} className="w-full h-10 rounded-xl bg-cream px-3 font-bold text-center text-[15px]" />
                      <span className="text-[12px] font-bold text-ink-soft">{f.type === 'percent' ? `= ${money(share, cur, { decimals: true })}` : 'fixed amount'}</span>
                      <button type="button" onClick={() => { const n = { ...fixed }; delete n[m.id]; setFixed(n) }} className="text-[12px] font-bold text-pink">Use equal share</button>
                    </div>
                  ) : (
                    <div className="mt-1 w-full flex flex-col items-center gap-1.5">
                      <span className="font-display font-bold text-[17px]">{money(share, cur, { decimals: true })}</span>
                      <span className="text-[11px] font-bold text-ink-faint -mt-1">equal share</span>
                      <button type="button" onClick={() => setFixed({ ...fixed, [m.id]: { type: 'amount', value: '' } })} className="tap h-8 px-3 rounded-full bg-ink text-white text-[12px] font-bold">Set amount or %</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {mode === 'fixed' && people.length > 0 && (
          <p className={`text-[13px] font-bold px-1 ${fixedInfo.rest < 0 || (fixedInfo.rest > 0 && !fixedInfo.equalIds.length) ? 'text-orange' : 'text-green'}`}>
            {fixedInfo.rest < 0
              ? `The fixed amounts are ${money(-fixedInfo.rest, cur, { decimals: true })} more than the total. Lower one of them.`
              : fixedInfo.rest > 0 && !fixedInfo.equalIds.length
                ? `${money(fixedInfo.rest, cur, { decimals: true })} isn’t covered. Tick someone to share the rest.`
                : `Adds up to ${money(total, cur, { decimals: true })}`}
          </p>
        )}
        {mode === 'custom' && people.length > 0 && (
          <p className={`text-[13px] font-bold px-1 ${Math.abs(remaining) < 0.005 ? 'text-green' : 'text-orange'}`}>
            {Math.abs(remaining) < 0.005 ? `Adds up to ${money(total, cur, { decimals: true })}` : remaining > 0 ? `${money(remaining, cur, { decimals: true })} left to assign` : `${money(-remaining, cur, { decimals: true })} too much`}
          </p>
        )}
        {mode !== 'items' && !people.length && <p className="text-[13px] font-bold text-orange px-1">Pick at least one person</p>}

        <div className="flex gap-2 mt-1">
          <Button type="button" variant="muted" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="dark" className="flex-[1.4]" disabled={!valid} loading={saving} onClick={save}><Icon name="check" size={18} stroke={2.8} /> Save split</Button>
        </div>
      </div>
    </Sheet>
  )
}
