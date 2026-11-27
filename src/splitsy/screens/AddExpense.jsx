import { useEffect, useMemo, useRef, useState } from 'react'
import { Screen, Assistant, Avatar, Button, PhotoInput, GalleryInput, Segmented, Confetti, Mascot, Spinner, useObjectURL, useObjectURLs, useToast, avatarColor } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate, back } from '../lib/router'
import { identify, warmUpModel } from '../lib/ai'
import { detectPlace } from '../lib/geo'
import { analyzePhoto } from '../lib/analyze'
import { CATEGORIES, catInfo } from '../lib/categories'
import { equalSplit, itemSplits } from '../lib/balances'
import { money, firstName, fullDateTime, toCents, fromCents } from '../lib/format'
import { CurrencyPicker, CurrencyChip, useRates } from '../components/CurrencyPicker'
import { CategoryPicker, CategoryField } from '../components/CategoryPicker'
import ItemEditor from '../components/ItemEditor'
import ItemAssign from '../components/ItemAssign'
import ScanningScreen from '../components/ScanningScreen'
import PhotoViewer from '../components/PhotoViewer'
import { currencySymbol, rateBetween, round2, formatRate, niceNumber } from '../lib/currency'

const SPLIT_MODES = [['equal', 'Equally'], ['fixed', 'Fixed + rest'], ['custom', 'Custom']]
const RECEIPT_MODES = [['items', 'By item'], ['equal', 'Equal'], ['fixed', 'Fixed+'], ['custom', 'Custom']]
const PHOTO_STEPS = ['photo', 'what', 'amount', 'payer', 'split', 'details', 'review']
const RECEIPT_STEPS = ['photo', 'items', 'payer', 'split', 'details', 'review']

export default function AddExpense({ groupId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [group, setGroup] = useState(null)
  const [step, setStep] = useState(0)
  const [flow, setFlow] = useState('photo') // 'photo' | 'receipt'
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [items, setItems] = useState([])
  const [receiptTotal, setReceiptTotal] = useState(null)
  const [scannedCount, setScannedCount] = useState(0)
  const [scanKind, setScanKind] = useState('photo')
  const [spottedPrice, setSpottedPrice] = useState(null)
  const STEPS = flow === 'receipt' ? RECEIPT_STEPS : PHOTO_STEPS
  const [photo, setPhoto] = useState(null)
  const photoUrl = useObjectURL(photo)
  const [thinking, setThinking] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Food')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(user.id)
  const [people, setPeople] = useState([])
  const [mode, setMode] = useState('equal')
  const [custom, setCustom] = useState({})
  const [fixed, setFixed] = useState({}) // { userId: { type: 'amount' | 'percent', value: '' } }
  const [method, setMethod] = useState('cash')
  const [channel, setChannel] = useState('in_person')
  const [place, setPlace] = useState(undefined) // undefined = detecting, null = unavailable
  const [placeName, setPlaceName] = useState('')
  const [extras, setExtras] = useState([])
  const extraUrls = useObjectURLs(extras)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [now] = useState(() => new Date().toISOString())
  const placePromise = useRef(null)
  const [expCur, setExpCur] = useState(null) // currency the bill was paid in
  const [manualRate, setManualRate] = useState('')
  const [curPicker, setCurPicker] = useState(false)
  const [catPicker, setCatPicker] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewer, setViewer] = useState(null) // index of the photo being previewed

  useEffect(() => {
    api.getGroup(groupId).then((g) => {
      setGroup(g)
      setPeople(g.members.map((m) => m.id))
    }).catch((e) => toast(e.message, 'error'))
    // Start location detection + AI model download right away, in the background
    placePromise.current = detectPlace().then((p) => {
      setPlace(p)
      if (p) setPlaceName(p.poi || p.name)
      return p
    })
    warmUpModel().catch(() => {})
  }, [groupId, toast])

  const cur = group?.currency || 'PHP'
  const ec = expCur || cur
  const foreign = ec !== cur
  const expSym = currencySymbol(ec)
  const { rates, error: rateError, loading: rateLoading } = useRates(foreign)
  const liveRate = foreign ? rateBetween(rates, ec, cur) : 1
  const rate = foreign ? Number(manualRate) || liveRate || 0 : 1
  const selectedItems = items.filter((i) => i.checked && Number(i.price))
  const itemsSum = fromCents(selectedItems.reduce((s, i) => s + toCents(i.price), 0))
  const orig = flow === 'receipt' ? Math.max(0, itemsSum) : Number(amount) || 0 // in the bill's currency
  const total = rate ? round2(orig * rate) : 0 // in the group's currency
  const members = group?.members || []
  const byId = (id) => members.find((m) => m.id === id)
  const nameOf = (id) => (id === user.id ? 'You' : firstName(byId(id)?.name))

  const everyone = useMemo(() => members.map((m) => m.id), [members])
  // Fixed + rest: some people pay a set amount or %, everyone else shares what's left equally
  const fixedInfo = useMemo(() => {
    const totalC = toCents(orig)
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
    const rest = totalC - sum
    return { fixedC, sum: fromCents(sum), rest: fromCents(rest), equalIds, each: equalIds.length && rest > 0 ? fromCents(rest / equalIds.length) : 0 }
  }, [people, fixed, orig])
  const splits = useMemo(() => {
    if (mode === 'fixed') {
      const list = Object.entries(fixedInfo.fixedC).map(([user_id, c]) => ({ user_id, amount: fromCents(c) }))
      if (fixedInfo.rest > 0 && fixedInfo.equalIds.length) list.push(...equalSplit(fixedInfo.rest, fixedInfo.equalIds))
      return list
    }
    if (mode === 'items') return itemSplits(selectedItems.map((i) => ({ ...i, price: Number(i.price) })), everyone)
    if (mode === 'equal') return equalSplit(orig, people)
    return people.map((id) => ({ user_id: id, amount: Number(custom[id]) || 0 }))
  }, [mode, orig, people, custom, selectedItems, everyone, fixedInfo])
  const splitSum = fromCents(splits.reduce((s, x) => s + toCents(x.amount), 0))
  const remaining = fromCents(toCents(orig) - toCents(splitSum))
  // Convert each person's share to the group currency; the last one absorbs rounding so it adds up exactly
  const savedSplits = useMemo(() => {
    const list = splits.filter((x) => x.amount !== 0)
    if (!foreign) return list
    let given = 0
    return list.map((x, k) => {
      const c = k === list.length - 1 ? toCents(total) - given : Math.round(toCents(x.amount) * rate)
      given += c
      return { user_id: x.user_id, amount: fromCents(c) }
    })
  }, [splits, foreign, rate, total])

  // ---------- photo → AI ----------
  // Every photo is read in full first: all its text (OCR) + what's in the picture (image AI)
  const onAnalyze = async (file, forceReceipt) => {
    const id = ++scanId.current
    setPhoto(file)
    setScanKind(forceReceipt ? 'receipt' : 'photo')
    setScanning(true)
    setProgress(0)
    // a new photo starts fresh
    setTitle('')
    setSuggestions([])
    setAmount('')
    setSpottedPrice(null)
    setItems([])
    setReceiptTotal(null)
    try {
      const r = await analyzePhoto(file, { onProgress: (v) => id === scanId.current && setProgress(v), placePromise: placePromise.current, forceReceipt })
      if (id !== scanId.current) return // cancelled
      if (r.isReceipt) {
        const rc = r.receipt || { items: [] }
        setFlow('receipt')
        setItems(rc.items)
        setScannedCount(rc.items.length)
        setMode('items')
        setReceiptTotal(rc.total ?? null)
        setTitle(rc.title || rc.store || r.place?.poi || 'Receipt')
        setCategory(rc.category || r.place?.venueCategory || 'Food')
      } else {
        setFlow('photo')
        applySuggestions(r.suggestions, r.place)
        if (r.price) {
          setAmount(String(r.price))
          setSpottedPrice(r.price)
        }
      }
      setStep(1)
    } catch (e) {
      if (id !== scanId.current) return
      console.warn('Photo analysis failed', e)
      setFlow('photo')
      applySuggestions([], null)
      setStep(1)
    } finally {
      if (id === scanId.current) setScanning(false)
    }
  }
  const onPhoto = (file) => onAnalyze(file, false)

  const applySuggestions = (sug, p) => {
    let list = sug
    if (!list.length && p?.poi) list = [{ title: p.venue ? `${p.poi} ${p.venue}` : p.poi, category: p.venueCategory || 'Other' }]
    setSuggestions(list)
    if (list[0]) {
      setTitle(list[0].title)
      setCategory(list[0].category)
    }
  }

  // ---------- receipt → OCR → checklist ----------
  const scanId = useRef(0)
  const cancelScan = () => {
    scanId.current++
    setScanning(false)
    setFlow('photo')
    setStep(0)
  }
  const updateItem = (id, patch) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const addItem = () => setItems((list) => [...list, { id: crypto.randomUUID?.() || String(Date.now()), name: '', qty: 1, price: '', checked: true, fresh: true }])

  const skipPhoto = async () => {
    setStep(1)
    const p = place === undefined ? await Promise.race([placePromise.current, new Promise((r) => setTimeout(() => r(null), 1500))]) : place
    if (!title) applySuggestions([], p)
  }

  // ---------- save ----------
  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        group_id: groupId,
        kind: 'expense',
        title: title.trim(),
        category,
        amount: total,
        paid_by: paidBy,
        splits: savedSplits,
        ...(foreign && { original_currency: ec, original_amount: orig, fx_rate: rate }),
        split_mode: mode,
        payment_method: method,
        channel,
        place_name: placeName.trim() || place?.name || null,
        place_address: place?.address || null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        note: note.trim() || null,
        ...(flow === 'receipt' && {
          items: selectedItems.map((i) => ({
            name: i.name.trim() || 'Item', qty: Number(i.qty) || 1, price: Number(i.price),
            ...(i.discount > 0 && Number(i.price) === Math.round((i.original - i.discount) * 100) / 100 && { original: i.original, discount: i.discount }),
            ...(i.shared && { shared: true }),
            ...(mode === 'items' && !i.shared && { people: i.people?.length ? i.people : everyone }),
          })),
        }),
      }
      const files = [photo, ...extras].filter(Boolean)
      const e = await api.createExpense(payload, files)
      setSaved(e)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!group) return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={32} /></div>
  if (saved) return <Done expense={saved} group={group} onAnother={() => navigate(`/group/${groupId}/add?${Date.now()}`, { replace: true })} payer={nameOf(saved.paid_by)} />

  const key = STEPS[step]
  const goBack = () => {
    if (step === 0) return back(`/group/${groupId}`)
    if (step === 1 && flow === 'receipt') setFlow('photo')
    setStep(step - 1)
  }
  const info = catInfo(category)

  // ---------- step content ----------
  let say, sub, body, cta, ctaOk = true, mascot = group.mascot
  if (key === 'photo') {
    say = `Hey ${firstName(user.name)}! What did you get?`
    sub = 'Snap the food, item, ticket or place — I’ll figure out the rest.'
    body = (
      <div className="flex flex-col pt-1 gap-3">
        <PhotoInput onPick={onPhoto} className="tap w-full">
          <div className="relative w-full rounded-[32px] grad-warm p-5 overflow-hidden text-left shadow-pop">
            <div className="absolute -right-6 -bottom-8 w-40 h-40 rounded-full bg-white/15" />
            <div className="absolute right-10 -top-10 w-24 h-24 rounded-full bg-white/10" />
            <span className="relative w-16 h-16 rounded-2xl bg-white text-ink grid place-items-center shadow-card"><Icon name="camera" size={30} /></span>
            <p className="relative font-display font-extrabold text-white text-[24px] mt-4 leading-tight">Take a photo</p>
            <p className="relative text-white/90 font-semibold text-[14px] mt-0.5">Food, items, tickets or receipts. I’ll read everything and fill it in.</p>
          </div>
        </PhotoInput>
        <GalleryInput multiple={false} onPick={onPhoto} className="tap w-full text-left">
          <div className="card p-4 flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-mint text-green grid place-items-center shrink-0"><Icon name="upload" size={24} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-[18px] leading-tight">Upload a photo</p>
              <p className="text-[13px] font-semibold text-ink-soft mt-0.5">From your gallery. Photos or receipts.</p>
            </div>
            <Icon name="chevron" size={20} className="text-ink-faint" />
          </div>
        </GalleryInput>
      </div>
    )
    cta = <Button variant="dark" className="w-full" onClick={skipPhoto}><Icon name="edit" size={18} /> No photo, I’ll type it in</Button>
  }

  if (key === 'what') {
    say = thinking ? 'Hmm, let me take a look…' : suggestions.length ? <>Ooh! Looks like <span className="grad-text">{suggestions[0].title}</span> <Icon name={catInfo(suggestions[0].category).icon} size="1em" style={{ color: catInfo(suggestions[0].category).color }} /></> : 'What was it for?'
    sub = thinking ? 'Identifying your photo' : suggestions.length ? 'Tap a suggestion or type your own.' : 'Give it a short name and pick a category.'
    mascot = 'bubble'
    body = (
      <div className="flex flex-col gap-4">
        {photoUrl && (
          <div className="relative rounded-[28px] overflow-hidden h-48 bg-white">
            <button type="button" onClick={() => !thinking && setViewer(0)} className="block w-full h-full" aria-label="Preview photo"><img src={photoUrl} alt="" className="w-full h-full object-cover" /></button>
            {!thinking && <span className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-ink/60 text-white grid place-items-center pointer-events-none"><Icon name="zoomIn" size={17} /></span>}
            {thinking && (
              <div className="absolute inset-0 bg-ink/25 grid place-items-center">
                <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-white/50 to-transparent animate-[scan_1.4s_ease-in-out_infinite]" />
                <span className="bg-white rounded-full px-4 py-2 font-bold text-[13px] flex items-center gap-2"><Spinner size={16} /> Thinking…</span>
              </div>
            )}
            <style>{'@keyframes scan{0%{top:-33%}100%{top:100%}}'}</style>
          </div>
        )}
        {!thinking && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 animate-rise">
            {suggestions.map((s) => {
              const on = s.title === title
              return (
                <button key={s.title} onClick={() => { setTitle(s.title); setCategory(s.category) }} className={`tap h-11 pl-3 pr-4 rounded-full border-2 font-bold text-[14px] flex items-center gap-1.5 ${on ? 'bg-ink border-ink text-white' : 'bg-white border-line'}`}>
                  <span><Icon name={catInfo(s.category).icon} size="1em" style={{ color: catInfo(s.category).color }} /></span> {s.title} <span className={`font-semibold ${on ? 'text-white/60' : 'text-ink-faint'}`}>· {s.category}</span>
                </button>
              )
            })}
          </div>
        )}
        {spottedPrice != null && !thinking && (
          <div className="rounded-2xl bg-mint px-4 py-3 text-[13px] font-semibold flex items-center gap-2 animate-rise">
            <Icon name="scan" size={16} className="text-green shrink-0" />
            <span className="flex-1">I spotted <b>{money(spottedPrice, ec, { decimals: true })}</b> on the photo and filled in the amount.</span>
          </div>
        )}
        <input className="field text-[18px]" placeholder="e.g. Pizza, Grab ride, Hotel" value={title} onChange={(e) => setTitle(e.target.value)} disabled={thinking} />
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.name} onClick={() => setCategory(c.name)} className={`tap h-[70px] rounded-2xl flex flex-col items-center justify-center gap-0.5 border-2 transition-colors ${category === c.name ? 'border-ink' : 'border-transparent'}`} style={{ background: c.tint }}>
              <span className="text-[22px] leading-none"><Icon name={c.icon} size="1em" style={{ color: c.color }} /></span>
              <span className="text-[11px] font-bold">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
    ctaOk = !thinking && title.trim().length > 0
  }

  if (key === 'items') {
    const found = scannedCount
    say = scanning ? 'Reading your receipt…' : found ? <>I found <span className="grad-text">{found} item{found === 1 ? '' : 's'}</span>! Untick anything not in this split</> : 'Hmm, I couldn’t read that one'
    sub = scanning ? 'Hold on, this takes a few seconds' : found ? 'Tap an item to edit it.' : 'Add the items yourself, or go back and retake the photo.'
    mascot = 'cloudpurple'
    const allOn = items.length > 0 && items.every((i) => i.checked)
    const diff = receiptTotal != null ? fromCents(toCents(receiptTotal) - toCents(items.reduce((s, i) => s + (Number(i.price) || 0), 0))) : 0
    body = (
      <div className="flex flex-col gap-4">
        {!scanning && (
          <>
            <div className="card p-3 flex items-center gap-3">
              {photoUrl && <PreviewThumb url={photoUrl} onOpen={() => setViewer(0)} className="w-14 h-14 rounded-2xl" />}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">Store / title</p>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Jollibee" className="w-full font-display font-bold text-[18px] bg-transparent placeholder:text-ink-faint" />
              </div>
            </div>

            <div className="flex gap-3">
              <CategoryField value={category} onClick={() => setCatPicker(true)} />
              <div className="w-[42%] shrink-0">
                <span className="block text-[12px] font-bold text-ink-soft uppercase tracking-wider">Currency</span>
                <button type="button" onClick={() => setCurPicker(true)} className="tap mt-1.5 w-full h-14 rounded-2xl bg-white shadow-card px-4 flex items-center gap-2 text-left" aria-label={`Currency: ${ec}. Tap to change`}>
                  <span className="font-display font-extrabold text-[16px] text-ink-soft shrink-0">{expSym.length > 3 ? ec.slice(0, 1) : expSym}</span>
                  <span className="flex-1 min-w-0 font-display font-bold text-[16px] truncate">{ec}</span>
                  <Icon name="chevronDown" size={18} stroke={2.6} className="text-ink-faint shrink-0" />
                </button>
              </div>
            </div>
            {foreign && conversionCard()}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <span className="font-bold text-[14px]">{selectedItems.length} of {items.length} selected</span>
                {items.length > 0 && (
                  <button onClick={() => setItems(items.map((i) => ({ ...i, checked: !allOn })))} className="text-[13px] font-bold text-pink">{allOn ? 'Unselect all' : 'Select all'}</button>
                )}
              </div>
              {items.map((i) => (
                <div key={i.id} className={`flex items-center gap-2 pl-3 border-b border-line transition-opacity ${i.checked ? '' : 'opacity-45'}`}>
                  <button onClick={() => updateItem(i.id, { checked: !i.checked })} className={`tap w-7 h-7 rounded-lg grid place-items-center border-2 shrink-0 transition-colors ${i.checked ? 'bg-green border-green text-white' : 'border-line bg-white'}`} aria-label={i.checked ? 'Exclude item' : 'Include item'}>
                    {i.checked && <Icon name="check" size={15} stroke={3} />}
                  </button>
                  <button onClick={() => setEditing(i)} className="tap flex-1 min-w-0 flex items-center gap-2 py-3 pr-3 text-left">
                    {Number(i.qty) > 1 && <span className="text-[12px] font-bold text-ink-soft bg-cream rounded-md px-1.5 py-0.5 shrink-0">{i.qty}×</span>}
                    <span className="flex-1 min-w-0">
                      <span className={`block font-bold text-[14px] truncate ${i.checked ? '' : 'line-through'} ${i.name ? '' : 'text-ink-faint'}`}>{i.name || 'Unnamed item'}</span>
                      {i.discount > 0 && Number(i.price) === Math.round((i.original - i.discount) * 100) / 100 && (
                        <span className="block text-[11px] font-bold text-green truncate">{money(i.original, ec, { decimals: true })} − {money(i.discount, ec, { decimals: true })} discount</span>
                      )}
                      {i.shared && <span className="block text-[11px] font-bold text-ink-faint">shared by everyone</span>}
                    </span>
                    <span className={`font-display font-bold text-[15px] shrink-0 ${Number(i.price) < 0 ? 'text-green' : ''}`}>{i.price === '' ? '—' : money(Number(i.price), ec, { decimals: true })}</span>
                    <Icon name="edit" size={15} className="text-ink-faint shrink-0" />
                  </button>
                </div>
              ))}
              <button onClick={() => setEditing({ id: crypto.randomUUID?.() || String(Date.now()), name: '', qty: 1, price: '', checked: true, isNew: true })} className="tap w-full flex items-center gap-2 px-4 py-3 font-bold text-[14px] text-ink-soft"><Icon name="plus" size={18} /> Add item</button>
            </div>

            {receiptTotal != null && Math.abs(diff) >= 0.01 && (
              <div className="rounded-2xl bg-[#FFF7D6] px-4 py-3 text-[13px] font-semibold flex items-start gap-2">
                <Icon name="idea" size={16} className="shrink-0 mt-0.5 text-[#E0A800]" />
                <span className="flex-1">The receipt total says <b>{money(receiptTotal, ec, { decimals: true })}</b> but the items add up to <b>{money(receiptTotal - diff, ec, { decimals: true })}</b>. Something may be missing or misread.</span>
                {diff > 0 && <button onClick={() => setItems([...items, { id: String(Date.now()), name: 'Other items', qty: 1, price: diff.toFixed(2), checked: true }])} className="font-bold text-pink shrink-0">Add {money(diff, ec)}</button>}
              </div>
            )}
          </>
        )}
      </div>
    )
    ctaOk = !scanning && title.trim().length > 0 && orig > 0 && rate > 0
  }

  if (key === 'amount') {
    say = 'How much was it?'
    sub = `Total for ${title.trim() || 'this'}`
    mascot = 'sun'
    const n = people.length || 1
    body = (
      <div className="flex flex-col items-center pt-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-3xl grid place-items-center text-[28px]" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /></div>
          <CurrencyChip code={ec} onClick={() => setCurPicker(true)} />
        </div>
        <label className="mt-4 flex items-baseline justify-center gap-1 w-full">
          <span className="font-display font-extrabold text-[40px] text-ink-faint">{expSym}</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
              if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setAmount(v)
            }}
            className="font-display font-extrabold text-[64px] leading-none bg-transparent text-center w-[70%] min-w-0 placeholder:text-ink/15"
          />
        </label>
        {foreign && <div className="w-full mt-4">{conversionCard()}</div>}
        {orig > 0 && (
          <p className="mt-4 bg-white rounded-full px-4 py-2 font-bold text-[14px] animate-pop">
            That’s about <span className="grad-text">{money(orig / n, ec, { decimals: true })}</span> each for {n} {n === 1 ? 'person' : 'people'}
          </p>
        )}
        <div className="flex gap-2 mt-6 flex-wrap justify-center">
          {[100, 250, 500, 1000, 2000].map((v) => (foreign && rate ? niceNumber(v / rate) : v)).filter((v, i, a) => v && a.indexOf(v) === i).map((q) => (
            <button key={q} onClick={() => setAmount(String(q))} className={`tap h-10 px-4 rounded-full font-bold text-[14px] transition-colors ${Number(amount) === q ? 'bg-ink text-white' : 'bg-lilac text-purple'}`}>{money(q, ec)}</button>
          ))}
        </div>
      </div>
    )
    ctaOk = orig > 0 && rate > 0
  }

  if (key === 'payer') {
    say = flow === 'receipt' ? 'Who paid for the whole receipt?' : 'Who paid for this one?'
    sub = `${money(orig, ec)} for ${title}`
    mascot = 'thumb'
    body = (
      <div className="grid grid-cols-3 gap-3">
        {members.map((m) => {
          const on = paidBy === m.id
          return (
            <button key={m.id} onClick={() => { setPaidBy(m.id); setTimeout(() => setStep((v) => (STEPS[v] === 'payer' ? v + 1 : v)), 220) }} aria-pressed={on} className={`tap relative aspect-[4/5] rounded-[24px] overflow-hidden shadow-card border-[3px] transition-colors ${on ? 'border-ink' : 'border-white'}`}>
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : m.is_placeholder ? (
                <span className="absolute inset-0 bg-paper grid place-items-center font-display font-extrabold text-[40px] text-ink-faint border-2 border-dashed border-ink/20 rounded-[20px]">{m.name.trim()[0]?.toUpperCase()}</span>
              ) : (
                <span className="absolute inset-0 grid place-items-center font-display font-extrabold text-[44px] text-ink/80" style={{ background: avatarColor(m.name) }}>{m.name.trim()[0]?.toUpperCase()}</span>
              )}
              <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
              <span className="absolute inset-x-1.5 bottom-2 text-white font-bold text-[13px] truncate text-center drop-shadow">{m.id === user.id ? 'Me' : firstName(m.name)}</span>
              {m.is_placeholder && <span className="absolute left-1.5 top-1.5 bg-white/90 text-ink-soft text-[9px] font-bold px-1.5 py-0.5 rounded-full">not joined</span>}
              {on && <span className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full bg-green text-white grid place-items-center ring-2 ring-white animate-pop"><Icon name="check" size={15} stroke={3} /></span>}
            </button>
          )
        })}
      </div>
    )
    cta = <p className="text-center text-[13px] font-semibold text-ink-faint py-4">Tap a person to continue</p>
  }

  if (key === 'split') {
    say = mode === 'items' ? 'Who had what?' : 'Who’s splitting it?'
    sub = mode === 'items' ? 'Tap faces to say who shared each item.' : mode === 'equal' ? 'Tap people to include or remove them.' : mode === 'fixed' ? 'Set a fixed amount or % for some people. The rest is split equally.' : 'Type how much each person owes.'
    mascot = 'strawberry'
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex bg-white rounded-full p-1 border-2 border-line">
          {(flow === 'receipt' ? RECEIPT_MODES : SPLIT_MODES).map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} className={`flex-1 h-10 rounded-full font-bold text-[13px] whitespace-nowrap transition-colors ${mode === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
          ))}
        </div>
        {mode === 'items' && (
          <ItemAssign items={selectedItems} members={members} me={user.id} cur={ec} everyone={everyone} onChange={(id, ppl) => updateItem(id, { people: ppl })} />
        )}
        {mode === 'items' && (
          <div className="card p-4">
            <p className="font-display font-bold text-[16px] mb-3">Each person pays</p>
            <div className="flex flex-col gap-2.5">
              {members.map((m) => {
                const amt = splits.find((x) => x.user_id === m.id)?.amount || 0
                return (
                  <div key={m.id} className={`flex items-center gap-3 ${amt ? '' : 'opacity-40'}`}>
                    <Avatar user={m} size={32} />
                    <span className="flex-1 font-bold text-[14px]">{m.id === user.id ? 'Me' : m.name}</span>
                    <span className="font-display font-bold text-[16px]">{money(amt, ec, { decimals: true })}</span>
                  </div>
                )
              })}
            </div>
            {selectedItems.some((i) => i.shared) && <p className="text-[12px] text-ink-soft font-semibold mt-3"> Service charge & discounts are shared based on what each person had.</p>}
          </div>
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
                  <button onClick={toggle} className="tap flex flex-col items-center gap-2 w-full" aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${m.name}`}>
                    <span className="relative p-1">
                      <span className={`block rounded-full transition-all ${on ? '' : 'opacity-40 grayscale'}`}><Avatar user={m} size={64} /></span>
                      <span className={`absolute right-0 bottom-0 w-7 h-7 rounded-full grid place-items-center ring-[3px] ring-white transition-colors ${on ? 'bg-green text-white' : 'bg-line text-ink-soft'}`}>
                        <Icon name={on ? 'check' : 'plus'} size={15} stroke={3} />
                      </span>
                    </span>
                    <span className={`font-bold text-[14px] truncate max-w-full ${on ? '' : 'text-ink-faint'}`}>{m.id === user.id ? 'Me' : firstName(m.name)}</span>
                  </button>
                  {m.is_placeholder && <span className="text-[10px] font-bold text-ink-faint -mt-1">not joined yet</span>}

                  {!on && <span className="text-[12px] font-semibold text-ink-faint mt-1">Tap to add</span>}

                  {on && mode === 'equal' && <span className="font-display font-bold text-[17px] mt-1">{money(share, ec, { decimals: true })}</span>}

                  {on && mode === 'custom' && (
                    <div className="mt-2 w-full flex items-center gap-1 bg-cream rounded-xl px-3 h-11">
                      <span className="text-ink-faint font-bold">{expSym}</span>
                      <input inputMode="decimal" placeholder="0" value={custom[m.id] ?? ''} onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value.replace(/[^0-9.]/g, '') })} className="w-full min-w-0 bg-transparent font-bold text-right text-[15px]" />
                    </div>
                  )}

                  {on && mode === 'fixed' && (f ? (
                    <div className="mt-2 w-full flex flex-col gap-1.5">
                      <div className="flex bg-cream rounded-xl p-0.5">
                        {[['amount', expSym], ['percent', '%']].map(([t, l]) => (
                          <button key={t} onClick={() => setFixed({ ...fixed, [m.id]: { ...f, type: t } })} className={`flex-1 h-8 rounded-lg text-[13px] font-bold ${f.type === t ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
                        ))}
                      </div>
                      <input autoFocus inputMode="decimal" placeholder="0" value={f.value} onChange={(e) => setFixed({ ...fixed, [m.id]: { ...f, value: e.target.value.replace(/[^0-9.]/g, '') } })} className="w-full h-10 rounded-xl bg-cream px-3 font-bold text-center text-[15px]" />
                      <span className="text-[12px] font-bold text-ink-soft">{f.type === 'percent' ? `= ${money(share, ec, { decimals: true })}` : 'fixed amount'}</span>
                      <button onClick={() => { const n = { ...fixed }; delete n[m.id]; setFixed(n) }} className="text-[12px] font-bold text-pink">Use equal share</button>
                    </div>
                  ) : (
                    <div className="mt-1 w-full flex flex-col items-center gap-1.5">
                      <span className="font-display font-bold text-[17px]">{money(share, ec, { decimals: true })}</span>
                      <span className="text-[11px] font-bold text-ink-faint -mt-1">equal share</span>
                      <button onClick={() => setFixed({ ...fixed, [m.id]: { type: 'amount', value: '' } })} className="tap h-8 px-3 rounded-full bg-ink text-white text-[12px] font-bold">Set amount or %</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
        {mode === 'fixed' && (() => {
          const { sum, rest, equalIds, each } = fixedInfo
          const bad = rest < 0 || (rest > 0 && equalIds.length === 0)
          return (
            <div className={`card p-4 ${bad ? 'ring-2 ring-orange' : ''}`}>
              <div className="flex justify-between text-[14px] font-semibold"><span className="text-ink-soft">Total</span><span className="font-bold">{money(orig, ec, { decimals: true })}</span></div>
              <div className="flex justify-between text-[14px] font-semibold mt-1.5"><span className="text-ink-soft">Fixed contributions</span><span className="font-bold">− {money(sum, ec, { decimals: true })}</span></div>
              <div className="h-px bg-line my-2.5" />
              <div className="flex justify-between text-[15px]"><span className="font-bold">Left to split</span><span className="font-display font-extrabold">{money(Math.max(rest, 0), ec, { decimals: true })}</span></div>
              {rest < 0 ? (
                <p className="text-[13px] font-bold text-orange mt-2">The fixed amounts are {money(-rest, ec, { decimals: true })} more than the total. Lower one of them.</p>
              ) : rest > 0 && equalIds.length === 0 ? (
                <p className="text-[13px] font-bold text-orange mt-2">{money(rest, ec, { decimals: true })} isn’t covered. Tick someone to share the rest, or adjust a fixed amount.</p>
              ) : rest > 0 ? (
                <p className="text-[13px] font-bold text-green mt-2">÷ {equalIds.length} {equalIds.length === 1 ? 'person' : 'people'} = {money(each, ec, { decimals: true })} each</p>
              ) : (
                <p className="text-[13px] font-bold text-green mt-2">Fixed amounts cover the whole bill</p>
              )}
            </div>
          )
        })()}
        {mode === 'custom' && (
          <p className={`text-center font-bold text-[14px] ${remaining === 0 ? 'text-green' : 'text-orange'}`}>
            {remaining === 0 ? 'Perfect, it adds up!' : remaining > 0 ? `${money(remaining, ec, { decimals: true })} left to assign` : `${money(-remaining, ec, { decimals: true })} too much`}
          </p>
        )}
      </div>
    )
    ctaOk = mode === 'items'
      ? selectedItems.every((i) => i.shared || !Array.isArray(i.people) || i.people.length > 0) && splits.length > 0
      : mode === 'fixed'
        ? people.length > 0 && fixedInfo.rest >= 0 && (fixedInfo.rest === 0 || fixedInfo.equalIds.length > 0)
        : people.length > 0 && (mode === 'equal' || remaining === 0)
  }

  if (key === 'details') {
    say = 'Almost done! A few quick details'
    sub = 'Date, time and place are filled in for you.'
    mascot = 'heart'
    body = (
      <div className="flex flex-col gap-5">
        <div>
          <p className="font-bold text-[14px] text-ink-soft mb-2">How was it paid?</p>
          <Segmented value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash', icon: 'cash' }, { value: 'card', label: 'Card', icon: 'card' }]} />
        </div>
        <div>
          <p className="font-bold text-[14px] text-ink-soft mb-2">Where did you buy it?</p>
          <Segmented value={channel} onChange={setChannel} options={[{ value: 'in_person', label: 'In person', icon: 'store' }, { value: 'online', label: 'Online', icon: 'globe' }]} />
        </div>
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-mint text-green grid place-items-center shrink-0"><Icon name="pin" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-ink-faint uppercase tracking-wider">Location</p>
              {place === undefined ? (
                <p className="font-bold text-[14px] text-ink-soft flex items-center gap-2"><Spinner size={14} /> Finding where you are…</p>
              ) : (
                <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder={place ? 'Name this place' : 'Location off — type a place'} className="w-full font-bold text-[15px] bg-transparent placeholder:text-ink-faint" />
              )}
              {place?.address && <p className="text-[12px] text-ink-soft font-medium truncate">{place.address}</p>}
            </div>
          </div>
          <div className="h-px bg-line" />
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-lilac text-purple grid place-items-center shrink-0"><Icon name="clock" /></span>
            <div>
              <p className="text-[12px] font-bold text-ink-faint uppercase tracking-wider">Date & time</p>
              <p className="font-bold text-[15px]">{fullDateTime(now)}</p>
            </div>
          </div>
        </div>
        <div>
          <p className="font-bold text-[14px] text-ink-soft mb-2">More photos (receipt, etc.)</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {photoUrl && <Thumb url={photoUrl} label="Main" onOpen={() => setViewer(0)} />}
            {extras.map((f, i) => <ExtraThumb key={i} url={extraUrls[i]} onOpen={() => setViewer((photoUrl ? 1 : 0) + i)} onRemove={() => setExtras(extras.filter((_, k) => k !== i))} />)}
            <PhotoInput onPick={(f) => setExtras([...extras, f])} className="tap w-20 h-20 shrink-0 rounded-2xl bg-white border-2 border-dashed border-ink/15 grid place-items-center text-ink-soft"><Icon name="camera" /></PhotoInput>
            <GalleryInput onPick={(fs) => setExtras([...extras, ...fs])} className="tap w-20 h-20 shrink-0 rounded-2xl bg-white border-2 border-dashed border-ink/15 grid place-items-center text-ink-soft"><Icon name="image" /></GalleryInput>
          </div>
        </div>
        <input className="field" placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    )
  }

  if (key === 'review') {
    say = 'Here’s the summary. Looks good?'
    sub = 'Tap save and I’ll update everyone’s balance.'
    mascot = 'buddy'
    body = (
      <div className="card overflow-hidden">
        {photoUrl && (
          <button type="button" onClick={() => setViewer(0)} className="block w-full h-28 bg-cream" aria-label="Preview photo"><img src={photoUrl} alt="" className="w-full h-full object-cover" /></button>
        )}
        <div className={`${photoUrl ? '-mt-9' : 'pt-5'} flex flex-col items-center px-4`}>
          <div className="w-[72px] h-[72px] rounded-full bg-white grid place-items-center text-[34px] ring-4 ring-white shadow-card" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /></div>
          <p className="font-display font-bold text-[22px] mt-2 text-center">{title}</p>
          <p className="font-display font-extrabold text-[40px] grad-text leading-tight">{money(total, cur, { decimals: true })}</p>
          {foreign && <p className="text-[13px] font-bold text-ink-soft -mt-0.5">Paid {money(orig, ec, { decimals: true })} · 1 {ec} = {formatRate(rate, cur)}</p>}
        </div>
        <div className="px-4 pb-4 mt-2">
          <Row label="Category"><span className="inline-flex items-center gap-1.5"><Icon name={info.icon} size={15} style={{ color: info.color }} />{category}</span></Row>
          <Row label="Paid by"><span className="flex items-center gap-2"><Avatar user={byId(paidBy)} size={22} />{nameOf(paidBy)}</span></Row>
          <Row label="Split">{mode === 'items' ? `By item · ${splits.length} ${splits.length === 1 ? 'person' : 'people'}` : mode === 'fixed' ? `Fixed + rest · ${splits.length} ${splits.length === 1 ? 'person' : 'people'}` : mode === 'equal' ? `Equally · ${people.length} ${people.length === 1 ? 'person' : 'people'}` : 'Custom amounts'}</Row>
          <Row label="Payment"><span className="inline-flex items-center gap-1.5"><Icon name={method === 'cash' ? 'cash' : 'card'} size={15} />{method === 'cash' ? 'Cash' : 'Card'} · {channel === 'online' ? 'Online' : 'In person'}</span></Row>
          <Row label="Place">{placeName || place?.name || '—'}</Row>
          <Row label="When">{fullDateTime(now)}</Row>
          {flow === 'receipt' && <Row label="Items">{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}</Row>}
          <Row label="Photos">{[photo, ...extras].filter(Boolean).length || 'None'}</Row>
        </div>
      </div>
    )
    cta = <Button variant="grad" className="w-full" loading={saving} onClick={save}><Icon name="check" size={19} stroke={2.8} /> Save transaction</Button>
  }

  function conversionCard() {
    return (
      <div className="rounded-2xl bg-lilac px-4 py-3 text-left">
        <div className="flex items-center gap-2 text-[13px] font-bold">
          <Icon name="convert" size={16} className="text-purple" />
          {rateLoading && !manualRate ? (
            <span className="flex items-center gap-2 text-ink-soft"><Spinner size={14} /> Getting today’s rate…</span>
          ) : rate ? (
            <span className="flex-1">{orig > 0 ? <>{money(orig, ec, { decimals: true })} = <span className="text-purple">{money(total, cur, { decimals: true })}</span></> : <>Converts to {cur}</>}</span>
          ) : (
            <span className="flex-1 text-red">{rateError || 'No rate for this currency'}. Type the rate below.</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 text-[12px] font-semibold text-ink-soft">
          <span>1 {ec} =</span>
          <input inputMode="decimal" value={manualRate} onChange={(e) => setManualRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={liveRate ? String(Number(liveRate.toPrecision(5))) : 'rate'} className="w-24 h-8 rounded-lg bg-white px-2 font-bold text-ink text-[13px]" />
          <span>{cur}</span>
          <span className="flex-1 text-right">{manualRate ? <button onClick={() => setManualRate('')} className="font-bold text-pink">Use live rate</button> : rates?.stale ? 'saved rate' : liveRate ? 'live rate' : ''}</span>
        </div>
      </div>
    )
  }

  return (
    <Screen className="flex flex-col">
      {viewer != null && <PhotoViewer photos={[photoUrl, ...extraUrls]} index={viewer} onClose={() => setViewer(null)} />}
      {scanning && <ScanningScreen kind={scanKind} photoUrl={photoUrl} progress={progress} onCancel={cancelScan} />}
      <CategoryPicker open={catPicker} onClose={() => setCatPicker(false)} value={category} onPick={setCategory} />
      <ItemEditor
        item={editing}
        currency={ec}
        symbol={expSym}
        onClose={() => setEditing(null)}
        onDelete={() => { setItems((list) => list.filter((x) => x.id !== editing.id)); setEditing(null) }}
        onSave={(patch) => {
          setItems((list) => (list.some((x) => x.id === editing.id) ? list.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) : [...list, { ...editing, ...patch, isNew: undefined }]))
          setEditing(null)
        }}
      />
      <CurrencyPicker open={curPicker} onClose={() => setCurPicker(false)} value={ec} onPick={(c) => { setExpCur(c); setManualRate('') }} title="What currency did you pay in?" note={`It’ll be converted to ${cur}, the group’s currency.`} />
      <div className="sticky top-0 z-30 bg-cream/85 backdrop-blur-xl safe-top">
        <div className="h-14 px-4 flex items-center gap-3">
          <button onClick={goBack} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Back"><Icon name={step === 0 ? 'close' : 'back'} /></button>
          <div className="flex-1 h-2.5 rounded-full bg-ink/10 overflow-hidden">
            <div className="h-full rounded-full grad-btn transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <span className="text-[13px] font-bold text-ink-faint w-9 text-right">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      <div className="px-5 pt-3 flex-1 flex flex-col gap-5" key={key}>
        <Assistant mascot={mascot} sub={sub}>{say}</Assistant>
        <div className="animate-rise pb-4" style={{ animationDelay: '.06s' }}>{body}</div>
      </div>

      <div className="sticky bottom-0 px-5 pt-3 safe-bottom bg-gradient-to-t from-cream via-cream to-cream/0">
        {cta || (
          <Button className="w-full" disabled={!ctaOk} onClick={() => setStep(step + 1)}>
            {key === 'items' && !scanning ? <>Next · {money(orig, ec, { decimals: true })}</> : 'Next'} <Icon name="arrow" size={18} />
          </Button>
        )}
      </div>
    </Screen>
  )
}


function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0 gap-4">
      <span className="text-ink-soft font-semibold text-[14px] shrink-0">{label}</span>
      <span className="font-bold text-[14px] text-right truncate">{children}</span>
    </div>
  )
}

function PreviewThumb({ url, onOpen, className = '' }) {
  return (
    <button type="button" onClick={onOpen} className={`tap relative overflow-hidden shrink-0 ${className}`} aria-label="Preview photo">
      <img src={url} alt="" className="w-full h-full object-cover" />
      <span className="absolute right-1 bottom-1 w-5 h-5 rounded-full bg-ink/60 text-white grid place-items-center"><Icon name="zoomIn" size={11} /></span>
    </button>
  )
}

function Thumb({ url, label, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="tap relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden" aria-label="Preview photo">
      <img src={url} alt="" className="w-full h-full object-cover" />
      {label && <span className="absolute bottom-1 left-1 bg-ink/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{label}</span>}
    </button>
  )
}

function ExtraThumb({ url, onOpen, onRemove }) {
  return (
    <div className="relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden">
      <button type="button" onClick={onOpen} className="tap block w-full h-full" aria-label="Preview photo">{url && <img src={url} alt="" className="w-full h-full object-cover" />}</button>
      <button onClick={onRemove} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 text-white grid place-items-center" aria-label="Remove photo"><Icon name="close" size={13} stroke={3} /></button>
    </div>
  )
}

function Done({ expense, group, onAnother, payer }) {
  const info = catInfo(expense.category)
  return (
    <Screen className="flex flex-col safe-top">
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center">
        <Confetti />
        <Mascot name="thumb" size={150} anim="pop" />
        <h1 className="font-display font-extrabold text-[34px] mt-4 animate-rise">All set!</h1>
        <p className="text-ink-soft font-medium mt-1 animate-rise">I’ve updated everyone’s balance.</p>
        <div className="card w-full mt-7 p-4 flex items-center gap-3 text-left animate-rise" style={{ animationDelay: '.1s' }}>
          <div className="w-12 h-12 rounded-2xl grid place-items-center text-[24px] shrink-0" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /></div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] truncate">{expense.title}</p>
            <p className="text-[12px] text-ink-soft font-semibold">{payer} paid · <span className="font-mono">{expense.ref}</span></p>
          </div>
          <p className="font-display font-bold text-[18px]">{money(expense.amount, group.currency)}</p>
        </div>
      </div>
      <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
        <Button onClick={() => navigate(`/group/${group.id}`, { replace: true })}>Back to {group.name}</Button>
        <Button variant="ghost" size="md" onClick={onAnother}><Icon name="plus" size={18} /> Add another</Button>
      </div>
    </Screen>
  )
}
