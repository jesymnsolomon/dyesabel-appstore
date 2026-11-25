import { useEffect, useState } from 'react'
import { Screen, TopBar, Avatar, Button, Sheet, PhotoInput, GalleryInput, Spinner, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { catInfo } from '../lib/categories'
import { mapsLink } from '../lib/geo'
import { money, fullDateTime, firstName } from '../lib/format'

export default function ExpenseDetail({ expenseId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [e, setE] = useState(null)
  const [group, setGroup] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [uploading, setUploading] = useState(false)

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
        <button onClick={() => setConfirmDel(true)} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center text-red" aria-label="Delete"><Icon name="trash" size={19} /></button>
      } />

      {/* Photos */}
      <section className="px-5 pt-2">
        {e.photos?.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-5 px-5">
            {e.photos.map((p, i) => (
              <button key={i} onClick={() => setViewer(p)} className="snap-center shrink-0 w-[85%] aspect-[4/3] rounded-[28px] overflow-hidden bg-white shadow-card">
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <div className="h-36 rounded-[28px] grid place-items-center text-[56px]" style={{ background: info.tint }}>{info.emoji}</div>
        )}
        <div className="flex gap-2 mt-3">
          <PhotoInput onPick={addPhotos} className="tap flex-1 h-11 rounded-full bg-white border-2 border-line font-bold text-[13px] flex items-center justify-center gap-1.5">
            {uploading ? <Spinner size={16} /> : <Icon name="camera" size={17} />} Add photo
          </PhotoInput>
          <GalleryInput onPick={addPhotos} className="tap flex-1 h-11 rounded-full bg-white border-2 border-line font-bold text-[13px] flex items-center justify-center gap-1.5">
            <Icon name="image" size={17} /> From gallery
          </GalleryInput>
        </div>
      </section>

      {/* Main */}
      <section className="px-5 mt-5">
        <div className="card p-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: info.tint }}>{info.emoji} {e.category}</span>
          <h1 className="font-display font-bold text-[24px] mt-2 leading-tight">{e.title}</h1>
          <p className="font-display font-extrabold text-[44px] grad-text leading-tight">{money(e.amount, cur, { decimals: true })}</p>
          <button onClick={async () => { await navigator.clipboard?.writeText(e.ref); toast('ID copied') }} className="tap mt-1 inline-flex items-center gap-1.5 bg-cream rounded-full px-3 py-1.5 text-[13px] font-bold">
            <Icon name="hash" size={14} /> <span className="font-mono tracking-wide">{e.ref}</span> <Icon name="copy" size={13} className="text-ink-faint" />
          </button>
        </div>
      </section>

      <section className="px-5 mt-4">
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
        {e.place_address && <p className="text-[12px] text-ink-faint font-semibold mt-2 px-1">📍 {e.place_address}</p>}
      </section>

      <section className="px-5 mt-5">
        <h2 className="font-display font-bold text-[18px] mb-3">{settle ? 'Received by' : 'Split between'}</h2>
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

      {viewer && (
        <div className="fixed inset-0 z-50 bg-ink/95 grid place-items-center p-4" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" className="max-w-full max-h-full rounded-2xl animate-pop" />
          <button className="absolute top-0 right-0 safe-top pr-4 text-white"><Icon name="close" size={28} /></button>
        </div>
      )}

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)}>
        <div className="text-center">
          <p className="text-[44px]">🗑️</p>
          <h3 className="font-display font-bold text-[22px] mt-1">Delete this transaction?</h3>
          <p className="text-ink-soft font-medium mt-1">Balances will be recalculated. This can’t be undone.</p>
        </div>
        <div className="flex gap-2 mt-5 mb-2">
          <Button variant="soft" className="flex-1" onClick={() => setConfirmDel(false)}>Keep it</Button>
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
