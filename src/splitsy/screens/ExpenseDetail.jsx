import { useEffect, useState } from 'react'
import { Screen, TopBar, Avatar, Button, Sheet, PhotoInput, GalleryInput, Spinner, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { catInfo } from '../lib/categories'
import { mapsLink } from '../lib/geo'
import PhotoViewer from '../components/PhotoViewer'
import ItemEditor from '../components/ItemEditor'
import EditExpense from '../components/EditExpense'
import SplitEditor from '../components/SplitEditor'
import { recomputeSplits } from '../lib/balances'
import { currencySymbol, round2, formatRate } from '../lib/currency'
import { money, fullDateTime, firstName } from '../lib/format'

export default function ExpenseDetail({ expenseId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [e, setE] = useState(null)
  const [group, setGroup] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getExpense(expenseId).then(async (x) => {
      setE(x)
      setGroup(await api.getGroup(x.group_id))
    }).catch((err) => toast(err.message, 'error'))
  }, [expenseId, toast])

  if (!e || !group) return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={32} /></div>

  const cur = group.currency
  const info = catInfo(e.category)
  const byId = (id) => group.members.find((m) => m.id === id) || { id, name: 'Former member' }
  const nameOf = (id) => (id === user.id ? 'You' : byId(id).name)
  const settle = e.kind === 'settlement'

  const addPhotos = async (files) => {
    setUploading(true)
    try {
      setE(await api.addPhotos(e, Array.isArray(files) ? files : [files]))
      toast('Photo added!')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  // Save edits; recompute the total + everyone's share when amounts change
  const persist = async (patch, message = 'Saved') => {
    setSaving(true)
    try {
      setE(await api.updateExpense(e.id, patch))
      toast(message)
      return true
    } catch (err) {
      toast(err.message, 'error')
      return false
    } finally {
      setSaving(false)
    }
  }
  const rate = e?.original_currency ? Number(e.fx_rate) || 1 : 1
  const memberIds = group?.members.map((m) => m.id) || []
  const splitPeople = (e?.splits || []).filter((s) => Number(s.amount) !== 0).map((s) => s.user_id)
  const totalsFor = (amountInBillCurrency, items, base = e) => {
    const amount = round2(amountInBillCurrency * rate)
    return {
      amount,
      splits: recomputeSplits(base, { amount, items }, memberIds, rate),
      ...(e.original_currency && { original_amount: round2(amountInBillCurrency) }),
    }
  }
  const saveItems = async (items, message, extra = {}) => {
    const sum = items.reduce((t, i) => t + Number(i.price), 0)
    if (sum <= 0) return toast('The items need to add up to more than zero', 'error')
    const ok = await persist({ items, ...extra, ...totalsFor(sum, items, { ...e, ...extra }) }, message)
    if (ok) setEditingItem(null)
  }
  const saveItem = (patch) => {
    const clean = { name: patch.name, qty: patch.qty, price: patch.price, ...(patch.people && { people: patch.people }) }
    let items = editingItem.isNew
      ? [...e.items, { ...clean, ...(e.split_mode === 'items' && !clean.people && { people: memberIds }) }]
      : e.items.map((it, k) => (k === editingItem.index ? { ...it, ...clean, ...(patch.discount === 0 && { discount: undefined, original: undefined }) } : it))
    // Picking people for an item means the bill is now split by item.
    // Items nobody was picked for yet keep the people who were already sharing the bill.
    const extra = {}
    if (patch.people && e.split_mode !== 'items') {
      extra.split_mode = 'items'
      items = items.map((it) => (it.shared || it.people?.length ? it : { ...it, people: splitPeople.length ? splitPeople : memberIds }))
    }
    saveItems(items, editingItem.isNew ? 'Item added' : 'Item updated', extra)
  }
  const saveSplit = async (patch) => {
    if (await persist(patch, 'Split updated')) setSplitOpen(false)
  }
  const deleteItem = () => {
    if (e.items.length <= 1) return toast('A receipt needs at least one item. Delete the whole transaction instead.', 'error')
    saveItems(e.items.filter((_, k) => k !== editingItem.index), 'Item deleted')
  }
  const saveDetails = async (d) => {
    const patch = {
      title: d.title.trim(), category: d.category, paid_by: d.paid_by, payment_method: d.payment_method,
      channel: d.channel, place_name: d.place_name.trim() || null, note: d.note.trim() || null,
    }
    const billAmount = e.original_currency ? Number(e.original_amount) : Number(e.amount)
    if (!e.items?.length && Number(d.amount) !== billAmount) Object.assign(patch, totalsFor(Number(d.amount)))
    if (await persist(patch, 'Transaction updated')) setEditOpen(false)
  }

  const del = async () => {
    try {
      await api.deleteExpense(e.id)
      toast('Transaction deleted')
      navigate(`/group/${group.id}`, { replace: true })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Screen className="pb-10">
      <TopBar title={settle ? 'Settlement' : 'Transaction'} fallback={`/group/${group.id}`} right={
        <div className="flex gap-2">
          <button onClick={() => setEditOpen(true)} className="tap h-10 px-4 rounded-full bg-ink text-white font-bold text-[13px] flex items-center gap-1.5" aria-label="Edit transaction"><Icon name="edit" size={15} /> Edit</button>
          <button onClick={() => setConfirmDel(true)} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center text-red" aria-label="Delete transaction"><Icon name="trash" size={19} /></button>
        </div>
      } />

      {/* Main */}
      <section className="px-5 pt-2">
        <div className="card p-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /> {e.category}</span>
          <h1 className="font-display font-bold text-[24px] mt-2 leading-tight">{e.title}</h1>
          <p className="font-display font-extrabold text-[44px] grad-text leading-tight">{money(e.amount, cur, { decimals: true })}</p>
          {e.original_currency && (
            <p className="text-[13px] font-bold text-purple -mt-0.5 flex items-center justify-center gap-1"><Icon name="convert" size={14} /> Paid {money(e.original_amount, e.original_currency, { decimals: true })} · 1 {e.original_currency} = {formatRate(Number(e.fx_rate), cur)}</p>
          )}
          <button onClick={async () => { await navigator.clipboard?.writeText(e.ref); toast('ID copied') }} className="tap mt-1 inline-flex items-center gap-1.5 bg-cream rounded-full px-3 py-1.5 text-[13px] font-bold">
            <Icon name="hash" size={14} /> <span className="font-mono tracking-wide">{e.ref}</span> <Icon name="copy" size={13} className="text-ink-faint" />
          </button>
        </div>
      </section>

      {/* Split */}
      <section className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-[18px]">{settle ? 'Received by' : 'Split between'}</h2>
          {!settle && <button onClick={() => setSplitOpen(true)} className="tap h-9 px-4 rounded-full bg-ink text-white font-bold text-[13px] flex items-center gap-1.5"><Icon name="users" size={15} /> Change</button>}
        </div>
        <div className="card divide-y divide-line">
          {(e.splits || []).map((s) => (
            <div key={s.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar user={byId(s.user_id)} size={38} />
              <span className="flex-1 font-bold text-[15px]">{nameOf(s.user_id)}</span>
              <span className="font-display font-bold text-[16px]">{money(s.amount, cur, { decimals: true })}</span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink-faint font-semibold mt-2 px-1">Added by {e.created_by === user.id ? 'you' : firstName(byId(e.created_by).name)}</p>
      </section>

      {/* Details */}
      <section className="px-5 mt-5">
        <div className="card px-4">
          <Row icon="wallet" tint="#FFF1E6" color="#FF8A3D" label="Paid by">
            <span className="flex items-center gap-2 justify-end"><Avatar user={byId(e.paid_by)} size={24} />{nameOf(e.paid_by)}</span>
          </Row>
          <Row icon="clock" tint="#ECE6FF" color="#9B7BFF" label="Date & time">{fullDateTime(e.created_at)}</Row>
          <Row icon={e.payment_method === 'card' ? 'card' : 'cash'} tint="#E6F8EE" color="#2BBF6A" label="Payment">{e.payment_method === 'card' ? 'Card' : 'Cash'}</Row>
          <Row icon={e.channel === 'online' ? 'globe' : 'store'} tint="#E5F4FE" color="#3DA9F5" label="Type">{e.channel === 'online' ? 'Online' : 'In person'}</Row>
          <Row icon="pin" tint="#FFEAF4" color="#FF6FB5" label="Location">
            {e.lat != null ? (
              <a href={mapsLink(e.lat, e.lng)} target="_blank" rel="noreferrer" className="underline decoration-2 decoration-pink/50 underline-offset-2">{e.place_name || 'Open map'}</a>
            ) : (e.place_name || '—')}
          </Row>
          {e.note && <Row icon="edit" tint="#FFF7D6" color="#F5B700" label="Note">{e.note}</Row>}
        </div>
        {e.place_address && <p className="text-[12px] text-ink-faint font-semibold mt-2 px-1 flex items-center gap-1"><Icon name="pin" size={13} /> {e.place_address}</p>}
      </section>

      {e.items?.length > 0 && (
        <section className="px-5 mt-5">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="font-display font-bold text-[17px] flex items-center gap-2"><Icon name="receipt" size={18} /> Receipt items</h2>
              <span className="text-[12px] font-bold text-ink-faint">Tap to edit</span>
            </div>
            {e.items.map((it, i) => (
              <button key={i} onClick={() => setEditingItem({ ...it, index: i, checked: true })} className="tap w-full flex items-center gap-2 px-4 py-2.5 border-t border-line text-left">
                {it.qty > 1 && <span className="text-[12px] font-bold text-ink-soft bg-cream rounded-md px-1.5 py-0.5">{it.qty}×</span>}
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[14px] truncate">{it.name}</span>
                  {e.split_mode === 'items' && !it.shared && it.people?.length >= group.members.length && group.members.length > 1 && (
                    <span className="block text-[11px] font-bold text-ink-faint mt-1">Everyone</span>
                  )}
                  {it.people?.length > 0 && it.people.length < group.members.length && (
                    <span className="flex items-center gap-1 mt-1">
                      {it.people.map((id) => <Avatar key={id} user={byId(id)} size={18} />)}
                      <span className="text-[11px] font-bold text-ink-faint ml-0.5">{it.people.map((id) => (id === user.id ? 'You' : firstName(byId(id).name))).join(', ')}</span>
                    </span>
                  )}
                  {it.shared && <span className="block text-[11px] font-bold text-ink-faint">shared fairly</span>}
                  {it.discount > 0 && <span className="block text-[11px] font-bold text-green">{money(it.original, e.original_currency || cur, { decimals: true })} − {money(it.discount, e.original_currency || cur, { decimals: true })} discount</span>}
                </span>
                <span className={`font-bold text-[14px] ${it.price < 0 ? 'text-green' : ''}`}>{money(it.price, e.original_currency || cur, { decimals: true })}</span>
                <Icon name="edit" size={14} className="text-ink-faint shrink-0" />
              </button>
            ))}
            <button onClick={() => setEditingItem({ name: '', qty: 1, price: '', checked: true, isNew: true })} className="tap w-full flex items-center gap-2 px-4 py-3 border-t border-line font-bold text-[14px] text-ink-soft"><Icon name="plus" size={18} /> Add item</button>
            <div className="flex items-center justify-between px-4 py-3 border-t-2 border-dashed border-line bg-cream/60">
              <span className="font-bold text-[14px]">Total</span>
              <span className="font-display font-extrabold text-[17px]">{e.original_currency ? money(e.original_amount, e.original_currency, { decimals: true }) : money(e.amount, cur, { decimals: true })}</span>
            </div>
          </div>
        </section>
      )}

      {/* Photos */}
      <section className="px-5 mt-5">
        <h2 className="font-display font-bold text-[18px] mb-3">Photos{e.photos?.length > 0 ? ` (${e.photos.length})` : ''}</h2>
        {e.photos?.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-5 px-5">
            {e.photos.map((p, i) => (
              <button key={i} onClick={() => setViewer(i)} className="relative snap-center shrink-0 w-[85%] aspect-[4/3] rounded-[28px] overflow-hidden bg-white shadow-card" aria-label="Preview photo">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <span className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-ink/60 text-white grid place-items-center"><Icon name="zoomIn" size={17} /></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="card px-4 py-5 flex items-center gap-3 text-ink-soft"><Icon name="image" size={20} /><span className="font-semibold text-[14px]">No photos yet. Add the receipt or what you got.</span></div>
        )}
        <div className="flex gap-2 mt-3">
          <PhotoInput onPick={addPhotos} className="tap flex-1 h-11 rounded-full bg-ink text-white font-bold text-[13px] flex items-center justify-center gap-1.5">
            {uploading ? <Spinner size={16} /> : <Icon name="camera" size={17} />} Add photo
          </PhotoInput>
          <GalleryInput onPick={addPhotos} className="tap flex-1 h-11 rounded-full bg-ink text-white font-bold text-[13px] flex items-center justify-center gap-1.5">
            <Icon name="image" size={17} /> From gallery
          </GalleryInput>
        </div>
      </section>

      {viewer != null && <PhotoViewer photos={e.photos} index={viewer} onClose={() => setViewer(null)} />}

      <ItemEditor
        item={editingItem}
        currency={e.original_currency || cur}
        symbol={currencySymbol(e.original_currency || cur)}
        hideInclude
        members={group.members}
        meId={user.id}
        defaultPeople={e.split_mode === 'items' ? memberIds : splitPeople}
        saving={saving}
        onClose={() => setEditingItem(null)}
        onSave={saveItem}
        onDelete={deleteItem}
      />
      <SplitEditor open={splitOpen} expense={e} group={group} meId={user.id} saving={saving} onClose={() => setSplitOpen(false)} onSave={saveSplit} />
      <EditExpense open={editOpen} expense={e} group={group} meId={user.id} saving={saving} onClose={() => setEditOpen(false)} onSave={saveDetails} />

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)}>
        <div className="text-center">
          <span className="w-16 h-16 rounded-full bg-[#fdecec] text-red grid place-items-center mx-auto"><Icon name="trash" size={28} /></span>
          <h3 className="font-display font-bold text-[22px] mt-1">Delete this transaction?</h3>
          <p className="text-ink-soft font-medium mt-1">Balances will be recalculated. This can’t be undone.</p>
        </div>
        <div className="flex gap-2 mt-5 mb-2">
          <Button variant="muted" className="flex-1" onClick={() => setConfirmDel(false)}>Keep it</Button>
          <Button variant="danger" className="flex-1" onClick={del}>Delete</Button>
        </div>
      </Sheet>
    </Screen>
  )
}

function Row({ icon, tint, color, label, children }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-line last:border-0">
      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: tint, color }}><Icon name={icon} size={18} /></span>
      <span className="text-ink-soft font-semibold text-[14px]">{label}</span>
      <span className="flex-1 font-bold text-[14px] text-right truncate">{children}</span>
    </div>
  )
}
