import { Avatar } from './ui'
import Icon from './Icon'
import { money, firstName } from '../lib/format'

/** Receipt items with avatar toggles for who had each one. */
export default function ItemAssign({ items, members, me, cur, everyone, onChange }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => {
        const ppl = Array.isArray(it.people) ? it.people : everyone
        const all = ppl.length === everyone.length
        return (
          <div key={it.id} className={`card p-3.5 ${!it.shared && ppl.length === 0 ? 'ring-2 ring-orange' : ''}`}>
            <div className="flex items-center gap-2">
              {Number(it.qty) > 1 && <span className="text-[12px] font-bold text-ink-soft bg-cream rounded-md px-1.5 py-0.5">{it.qty}×</span>}
              <span className="flex-1 font-bold text-[15px] truncate">{it.name || 'Item'}</span>
              <span className={`font-display font-bold text-[15px] ${Number(it.price) < 0 ? 'text-green' : ''}`}>{money(Number(it.price), cur, { decimals: true })}</span>
            </div>
            {it.shared ? (
              <p className="text-[12px] font-semibold text-ink-soft mt-1.5">Shared fairly by everyone, based on what they had</p>
            ) : (
              <>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[12px] font-bold text-ink-faint">{ppl.length > 1 ? `${money(Number(it.price) / ppl.length, cur, { decimals: true })} each` : ppl.length === 1 ? 'Just one person' : 'Nobody yet'}</span>
                  <button onClick={() => onChange(it.id, all ? [] : everyone)} className={`tap h-8 px-3 rounded-full text-[12px] font-bold border-2 ${all ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>
                    {all ? 'Everyone' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-3 mt-3">
                  {members.map((m) => {
                    const on = ppl.includes(m.id)
                    return (
                      <button key={m.id} onClick={() => onChange(it.id, on ? ppl.filter((x) => x !== m.id) : [...ppl, m.id])} className="tap flex flex-col items-center gap-1 w-[60px]" aria-pressed={on} aria-label={m.name}>
                        <span className="relative p-[3px]">
                          <span className={`block rounded-full ring-[3px] transition-all ${on ? 'ring-green' : 'ring-transparent opacity-35 grayscale'}`}><Avatar user={m} size={48} /></span>
                          {on && <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-green text-white grid place-items-center ring-2 ring-white"><Icon name="check" size={11} stroke={3.2} /></span>}
                        </span>
                        <span className={`text-[11px] font-bold truncate max-w-full ${on ? '' : 'text-ink-faint'}`}>{m.id === me ? 'Me' : firstName(m.name)}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {!it.shared && ppl.length === 0 && <p className="text-[12px] font-bold text-orange mt-1.5">Pick who had this</p>}
          </div>
        )
      })}
    </div>
  )
}
