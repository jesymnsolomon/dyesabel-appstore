import { useEffect, useMemo, useRef, useState } from 'react'
import { Screen, Assistant, Avatar, Button, PhotoInput, GalleryInput, Segmented, Confetti, Mascot, Spinner, useObjectURL, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate, back } from '../lib/router'
import { identify, warmUpModel } from '../lib/ai'
import { detectPlace } from '../lib/geo'
import { CATEGORIES, catInfo } from '../lib/categories'
import { equalSplit } from '../lib/balances'
import { money, firstName, fullDateTime, toCents, fromCents, CURRENCIES } from '../lib/format'

const STEPS = ['photo', 'what', 'amount', 'payer', 'split', 'details', 'review']

export default function AddExpense({ groupId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [group, setGroup] = useState(null)
  const [step, setStep] = useState(0)
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
  const [method, setMethod] = useState('cash')
  const [channel, setChannel] = useState('in_person')
  const [place, setPlace] = useState(undefined) // undefined = detecting, null = unavailable
  const [placeName, setPlaceName] = useState('')
  const [extras, setExtras] = useState([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [now] = useState(() => new Date().toISOString())
  const placePromise = useRef(null)

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
  const sym = CURRENCIES[cur]?.symbol || '₱'
  const total = Number(amount) || 0
  const members = group?.members || []
  const byId = (id) => members.find((m) => m.id === id)
  const nameOf = (id) => (id === user.id ? 'You' : firstName(byId(id)?.name))

  const splits = useMemo(() => {
    if (mode === 'equal') return equalSplit(total, people)
    return people.map((id) => ({ user_id: id, amount: Number(custom[id]) || 0 }))
  }, [mode, total, people, custom])
  const splitSum = fromCents(splits.reduce((s, x) => s + toCents(x.amount), 0))
  const remaining = fromCents(toCents(total) - toCents(splitSum))

  // ---------- photo → AI ----------
  const onPhoto = async (file) => {
    setPhoto(file)
    setThinking(true)
    setStep(1)
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await img.decode()
      const p = await Promise.race([placePromise.current, new Promise((r) => setTimeout(() => r(null), 3500))])
      const sug = await identify(img, p)
      URL.revokeObjectURL(url)
      applySuggestions(sug, p)
    } catch {
      applySuggestions([], null)
    } finally {
      setThinking(false)
    }
  }

  const applySuggestions = (sug, p) => {
    let list = sug
    if (!list.length && p?.poi) list = [{ title: p.venue ? `${p.poi} ${p.venue}` : p.poi, category: p.venueCategory || 'Other' }]
    setSuggestions(list)
    if (list[0]) {
      setTitle(list[0].title)
      setCategory(list[0].category)
    }
  }

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
        splits: splits.filter((s) => s.amount > 0),
        split_mode: mode,
        payment_method: method,
        channel,
        place_name: placeName.trim() || place?.name || null,
        place_address: place?.address || null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        note: note.trim() || null,
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
  const goBack = () => (step === 0 ? back(`/group/${groupId}`) : setStep(step - 1))
  const info = catInfo(category)

  // ---------- step content ----------
  let say, sub, body, cta, ctaOk = true, mascot = group.mascot
  if (key === 'photo') {
    say = `Hey ${firstName(user.name)}! What did you get? 📸`
    sub = 'Snap the food, item, ticket or place — I’ll figure out the rest.'
    body = (
      <div className="flex flex-col items-center pt-2">
        <PhotoInput onPick={onPhoto} className="tap w-full">
          <div className="w-full aspect-[4/3.4] rounded-[32px] border-[3px] border-dashed border-ink/15 bg-white flex flex-col items-center justify-center gap-3">
            <div className="w-20 h-20 rounded-full grad-btn grid place-items-center text-white shadow-pop"><Icon name="camera" size={34} /></div>
            <p className="font-display font-bold text-[19px]">Take a photo</p>
            <p className="text-[13px] font-semibold text-ink-faint -mt-2">pizza, shirt, grab ride, hotel…</p>
          </div>
        </PhotoInput>
        <GalleryInput multiple={false} onPick={onPhoto} className="tap mt-4 h-11 px-5 rounded-full bg-white border-2 border-line font-bold text-[14px] flex items-center gap-2">
          <Icon name="image" size={18} /> Choose from gallery
        </GalleryInput>
      </div>
    )
    cta = <Button variant="ghost" size="md" className="w-full" onClick={skipPhoto}>No photo — I’ll type it</Button>
  }

  if (key === 'what') {
    say = thinking ? 'Hmm, let me take a look… 🔎' : suggestions.length ? <>Ooh! Looks like <span className="grad-text">{suggestions[0].title}</span> {catInfo(suggestions[0].category).emoji}</> : 'What was it for?'
    sub = thinking ? 'Identifying your photo' : suggestions.length ? 'Tap a suggestion or type your own.' : 'Give it a short name and pick a category.'
    mascot = 'bubble'
    body = (
      <div className="flex flex-col gap-4">
        {photoUrl && (
          <div className="relative rounded-[28px] overflow-hidden h-48 bg-white">
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
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
                  <span>{catInfo(s.category).emoji}</span> {s.title} <span className={`font-semibold ${on ? 'text-white/60' : 'text-ink-faint'}`}>· {s.category}</span>
                </button>
              )
            })}
          </div>
        )}
        <input className="field text-[18px]" placeholder="e.g. Pizza, Grab ride, Hotel" value={title} onChange={(e) => setTitle(e.target.value)} disabled={thinking} />
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.name} onClick={() => setCategory(c.name)} className={`tap h-[70px] rounded-2xl flex flex-col items-center justify-center gap-0.5 border-2 transition-colors ${category === c.name ? 'border-ink' : 'border-transparent'}`} style={{ background: c.tint }}>
              <span className="text-[22px] leading-none">{c.emoji}</span>
              <span className="text-[11px] font-bold">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
    ctaOk = !thinking && title.trim().length > 0
  }

  if (key === 'amount') {
    say = 'How much was it? 💸'
    sub = `Total for ${title.trim() || 'this'}`
    mascot = 'sun'
    const n = people.length || 1
    body = (
      <div className="flex flex-col items-center pt-4">
        <div className="w-16 h-16 rounded-3xl grid place-items-center text-[32px]" style={{ background: info.tint }}>{info.emoji}</div>
        <label className="mt-4 flex items-baseline justify-center gap-1 w-full">
          <span className="font-display font-extrabold text-[40px] text-ink-faint">{sym}</span>
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
        {total > 0 && (
          <p className="mt-4 bg-white rounded-full px-4 py-2 font-bold text-[14px] animate-pop">
            That’s about <span className="grad-text">{money(total / n, cur, { decimals: true })}</span> each for {n} {n === 1 ? 'person' : 'people'}
          </p>
        )}
        <div className="flex gap-2 mt-6 flex-wrap justify-center">
          {[100, 250, 500, 1000, 2000].map((q) => (
            <button key={q} onClick={() => setAmount(String(q))} className="tap h-10 px-4 rounded-full bg-white border-2 border-line font-bold text-[14px]">{money(q, cur)}</button>
          ))}
        </div>
      </div>
    )
    ctaOk = total > 0
  }

  if (key === 'payer') {
    say = 'Who paid for this one? 🙋'
    sub = `${money(total, cur)} for ${title}`
    mascot = 'thumb'
    body = (
      <div className="grid grid-cols-3 gap-3">
        {members.map((m) => {
          const on = paidBy === m.id
          return (
            <button key={m.id} onClick={() => setPaidBy(m.id)} className={`tap card p-3 pt-4 flex flex-col items-center gap-2 border-[3px] transition-colors ${on ? 'border-ink' : 'border-transparent'}`}>
              <div className="relative">
                <Avatar user={m} size={60} />
                {on && <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-green text-white grid place-items-center ring-2 ring-white animate-pop"><Icon name="check" size={14} stroke={3} /></span>}
              </div>
              <span className="font-bold text-[13px] truncate max-w-full">{m.id === user.id ? 'Me' : firstName(m.name)}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (key === 'split') {
    say = 'Who’s splitting it? 🍰'
    sub = mode === 'equal' ? 'Tap people to include or remove them.' : 'Type how much each person owes.'
    mascot = 'strawberry'
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex bg-white rounded-full p-1 border-2 border-line">
          {[['equal', 'Split equally'], ['custom', 'Custom amounts']].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} className={`flex-1 h-10 rounded-full font-bold text-[14px] transition-colors ${mode === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
          ))}
        </div>
        <div className="card divide-y divide-line overflow-hidden">
          {members.map((m) => {
            const on = people.includes(m.id)
            const share = splits.find((s) => s.user_id === m.id)?.amount || 0
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setPeople(on ? people.filter((x) => x !== m.id) : [...people, m.id])} className="tap flex items-center gap-3 flex-1 min-w-0 text-left">
                  <span className={`w-7 h-7 rounded-full grid place-items-center border-2 shrink-0 transition-colors ${on ? 'bg-green border-green text-white' : 'border-line'}`}>{on && <Icon name="check" size={15} stroke={3} />}</span>
                  <Avatar user={m} size={38} />
                  <span className={`font-bold text-[15px] truncate ${on ? '' : 'text-ink-faint'}`}>{m.id === user.id ? 'Me' : m.name}</span>
                </button>
                {on && mode === 'equal' && <span className="font-display font-bold text-[16px]">{money(share, cur, { decimals: true })}</span>}
                {on && mode === 'custom' && (
                  <div className="flex items-center gap-1 bg-cream rounded-xl px-2 h-10 w-28">
                    <span className="text-ink-faint font-bold">{sym}</span>
                    <input inputMode="decimal" placeholder="0" value={custom[m.id] ?? ''} onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value.replace(/[^0-9.]/g, '') })} className="w-full bg-transparent font-bold text-right" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {mode === 'custom' && (
          <p className={`text-center font-bold text-[14px] ${remaining === 0 ? 'text-green' : 'text-orange'}`}>
            {remaining === 0 ? 'Perfect, it adds up! ✅' : remaining > 0 ? `${money(remaining, cur, { decimals: true })} left to assign` : `${money(-remaining, cur, { decimals: true })} too much`}
          </p>
        )}
      </div>
    )
    ctaOk = people.length > 0 && (mode === 'equal' || remaining === 0)
  }

  if (key === 'details') {
    say = 'Almost done! A few quick details ✨'
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
            {photoUrl && <Thumb url={photoUrl} label="Main" />}
            {extras.map((f, i) => <ExtraThumb key={i} file={f} onRemove={() => setExtras(extras.filter((_, k) => k !== i))} />)}
            <PhotoInput onPick={(f) => setExtras([...extras, f])} className="tap w-20 h-20 shrink-0 rounded-2xl bg-white border-2 border-dashed border-ink/15 grid place-items-center text-ink-soft"><Icon name="camera" /></PhotoInput>
            <GalleryInput onPick={(fs) => setExtras([...extras, ...fs])} className="tap w-20 h-20 shrink-0 rounded-2xl bg-white border-2 border-dashed border-ink/15 grid place-items-center text-ink-soft"><Icon name="image" /></GalleryInput>
          </div>
        </div>
        <input className="field" placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    )
  }

  if (key === 'review') {
    say = 'Here’s the summary. Looks good? 👀'
    sub = 'Tap save and I’ll update everyone’s balance.'
    mascot = 'buddy'
    body = (
      <div className="card overflow-hidden">
        <div className="relative h-28 grad-warm">
          {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />}
        </div>
        <div className="-mt-9 flex flex-col items-center px-4">
          <div className="w-[72px] h-[72px] rounded-full bg-white grid place-items-center text-[34px] ring-4 ring-white shadow-card" style={{ background: info.tint }}>{info.emoji}</div>
          <p className="font-display font-bold text-[22px] mt-2 text-center">{title}</p>
          <p className="font-display font-extrabold text-[40px] grad-text leading-tight">{money(total, cur, { decimals: true })}</p>
        </div>
        <div className="px-4 pb-4 mt-2">
          <Row label="Category">{info.emoji} {category}</Row>
          <Row label="Paid by"><span className="flex items-center gap-2"><Avatar user={byId(paidBy)} size={22} />{nameOf(paidBy)}</span></Row>
          <Row label="Split">{mode === 'equal' ? `Equally · ${people.length} ${people.length === 1 ? 'person' : 'people'}` : 'Custom amounts'}</Row>
          <Row label="Payment">{method === 'cash' ? '💵 Cash' : '💳 Card'} · {channel === 'online' ? 'Online' : 'In person'}</Row>
          <Row label="Place">{placeName || place?.name || '—'}</Row>
          <Row label="When">{fullDateTime(now)}</Row>
          <Row label="Photos">{[photo, ...extras].filter(Boolean).length || 'None'}</Row>
        </div>
      </div>
    )
    cta = <Button variant="grad" className="w-full" loading={saving} onClick={save}>Save transaction 🎉</Button>
  }

  return (
    <Screen className="flex flex-col">
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
            Next <Icon name="arrow" size={18} />
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

function Thumb({ url, label }) {
  return (
    <div className="relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden">
      <img src={url} alt="" className="w-full h-full object-cover" />
      {label && <span className="absolute bottom-1 left-1 bg-ink/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{label}</span>}
    </div>
  )
}

function ExtraThumb({ file, onRemove }) {
  const url = useObjectURL(file)
  return (
    <div className="relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      <button onClick={onRemove} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 text-white grid place-items-center"><Icon name="close" size={13} stroke={3} /></button>
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
        <h1 className="font-display font-extrabold text-[34px] mt-4 animate-rise">All set! 🎉</h1>
        <p className="text-ink-soft font-medium mt-1 animate-rise">I’ve updated everyone’s balance.</p>
        <div className="card w-full mt-7 p-4 flex items-center gap-3 text-left animate-rise" style={{ animationDelay: '.1s' }}>
          <div className="w-12 h-12 rounded-2xl grid place-items-center text-[24px] shrink-0" style={{ background: info.tint }}>{info.emoji}</div>
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
