import { useState } from 'react'
import { Sheet } from './ui'
import Icon from './Icon'
import { CATEGORIES, catInfo } from '../lib/categories'

/** Searchable category list in a bottom sheet. */
export function CategoryPicker({ open, onClose, value, onPick }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = query ? CATEGORIES.filter((c) => c.name.toLowerCase().includes(query)) : CATEGORIES
  const close = () => { setQ(''); onClose() }
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Category"
      header={
        <div className="relative pb-3">
          <Icon name="search" size={18} className="absolute left-4 top-7 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" className="field pl-11" />
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2 pb-4">
        {list.map((c) => (
          <button key={c.name} onClick={() => { onPick(c.name); close() }} className={`tap h-20 rounded-2xl flex flex-col items-center justify-center gap-1 border-2 ${value === c.name ? 'border-ink' : 'border-transparent'}`} style={{ background: c.tint }}>
            <Icon name={c.icon} size={24} style={{ color: c.color }} />
            <span className="text-[12px] font-bold">{c.name}</span>
          </button>
        ))}
        {!list.length && <p className="col-span-3 text-center text-ink-soft font-semibold py-6">No category matches “{q}”</p>}
      </div>
    </Sheet>
  )
}

/** Dropdown-style field showing the current category. */
export function CategoryField({ value, onClick }) {
  const c = catInfo(value)
  return (
    <button type="button" onClick={onClick} className="tap flex-1 min-w-0 h-14 rounded-2xl bg-white border-2 border-line px-3 flex items-center gap-2 text-left">
      <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: c.tint, color: c.color }}><Icon name={c.icon} size={17} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-faint leading-none">Category</span>
        <span className="block font-bold text-[14px] truncate mt-0.5">{c.name}</span>
      </span>
      <Icon name="chevronDown" size={16} className="text-ink-faint shrink-0" />
    </button>
  )
}
