import { useCallback, useEffect, useMemo, useState } from 'react'
import { Screen, Mascot, Avatar, AvatarStack, Button, Sheet, Segmented, Empty, MASCOTS, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate, back } from '../lib/router'
import { groupStats } from '../lib/balances'
import { catInfo } from '../lib/categories'
import { money, firstName, relDay } from '../lib/format'
import { shareInvite } from './Invite'
import { useNotifications } from '../notifications'
import { CurrencyPicker, CurrencyChip, useRates, useViewCurrency } from '../components/CurrencyPicker'
import { rateBetween, formatRate } from '../lib/currency'

export default function Group({ groupId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState(null)
  const [settle, setSettle] = useState(null)
  const [tab, setTab] = useState('overview')
  const [menu, setMenu] = useState(false)
  const [viewCur, setViewCur] = useViewCurrency(`group-${groupId}`, null)
  const [curPicker, setCurPicker] = useState(false)
  const gc = group?.currency
  const vc = viewCur || gc
  const { rates, loading: ratesLoading } = useRates(Boolean(gc && vc !== gc))

  const load = useCallback(async () => {
    try {
      const [g, ex] = await Promise.all([api.getGroup(groupId), api.listExpenses(groupId)])
      setGroup(g)
      setExpenses(ex)
    } catch (e) {
      toast(e.message, 'error')
    }
  }, [groupId, toast])

  useEffect(() => {
    load()
    return api.subscribe(groupId, load)
  }, [groupId, load])

  const stats = useMemo(() => (group && expenses ? groupStats(expenses, group.members.map((m) => m.id), user.id) : null), [group, expenses, user.id])

  if (!group || !stats) {
    return (
      <Screen className="px-5 safe-top pt-4 flex flex-col gap-4">
        <div className="skeleton h-12 w-40" />
        <div className="skeleton h-52" />
        <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      </Screen>
    )
  }

  const cur = group.currency
  const viewRate = vc === cur ? 1 : rateBetween(rates, cur, vc)
  const showCur = viewRate ? vc : cur
  const fm = (v, o) => money(Number(v) * (viewRate || 1), showCur, o)
  const byId = (id) => group.members.find((m) => m.id === id) || { id, name: 'Former member' }
  const nameOf = (id) => (id === user.id ? 'You' : firstName(byId(id).name))
  const myDebts = stats.debts.filter((d) => d.from === user.id || d.to === user.id)
  const net = stats.myNet

  let tip
  if (!stats.count) tip = 'Add your first expense and I’ll do all the math for you!'
  else if (net > 0) tip = `${myDebts.filter((d) => d.to === user.id).map((d) => nameOf(d.from)).join(' & ')} still owe${myDebts.filter((d) => d.to === user.id).length === 1 ? 's' : ''} you. Want to nudge them?`
  else if (net < 0) tip = `You owe ${fm(-net, { decimals: true })} in total. Settle up when you can`
  else tip = 'You’re all square in this group. Love that for you'

  return (
    <Screen className="pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-cream/85 backdrop-blur-xl safe-top">
        <div className="h-14 px-4 flex items-center gap-3">
          <button onClick={() => back('/')} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Back"><Icon name="back" /></button>
          <h1 className="flex-1 font-display font-bold text-[18px] truncate">{group.name}</h1>
          <button onClick={() => shareInvite(group, toast)} className="tap h-10 px-4 rounded-full bg-ink text-white font-bold text-[13px] flex items-center gap-1.5"><Icon name="plus" size={16} stroke={2.8} /> Invite</button>
          <button onClick={() => setMenu(true)} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Group options"><Icon name="more" size={20} /></button>
        </div>
      </div>

      {/* Hero */}
      <section className="px-5 pt-2">
        <div className="relative rounded-[32px] grad-warm p-5 pb-4 overflow-hidden shadow-pop animate-rise">
          <Mascot name={group.mascot} size={112} className="absolute -right-1 top-3" />
          <p className="text-white/85 font-bold text-[12px] uppercase tracking-wider">Total group spending</p>
          <p className="font-display font-extrabold text-white text-[42px] leading-tight mt-0.5">{fm(stats.total)}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <AvatarStack users={group.members} size={28} max={5} />
            <span className="text-white font-bold text-[13px]">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</span>
          </div>
          <div className="flex items-center gap-2 mt-3 relative">
            <span className="text-white/85 font-bold text-[12px]">View in</span>
            <CurrencyChip code={showCur} dark onClick={() => setCurPicker(true)} />
            {vc !== cur && <button onClick={() => setViewCur(cur)} className="text-white font-bold text-[12px] underline underline-offset-2">Back to {cur}</button>}
            {vc !== cur && ratesLoading && <span className="text-white/80 text-[12px] font-bold">loading rate…</span>}
            {vc !== cur && !ratesLoading && !viewRate && <span className="text-white text-[12px] font-bold">rate unavailable</span>}
          </div>
          {vc !== cur && viewRate && <p className="text-white/80 text-[11px] font-semibold mt-1 relative">1 {cur} ≈ {formatRate(viewRate, vc)} · display only, balances are kept in {cur}</p>}
          <div className="mt-4 rounded-2xl bg-white/95 p-3 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl grid place-items-center ${net > 0 ? 'bg-mint text-green' : net < 0 ? 'bg-[#fdecec] text-red' : 'bg-lilac text-purple'}`}><Icon name={net > 0 ? 'coins' : net < 0 ? 'wallet' : 'check'} size={20} /></span>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-ink-faint">Your balance</p>
              <p className={`font-display font-extrabold text-[18px] leading-tight ${net > 0 ? 'text-green' : net < 0 ? 'text-red' : ''}`}>
                {net > 0 ? `You’re owed ${fm(net, { decimals: true })}` : net < 0 ? `You owe ${fm(-net, { decimals: true })}` : 'All settled up'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Assistant tip */}
      <section className="px-5 mt-4">
        <div className="flex items-center gap-3 animate-rise" style={{ animationDelay: '.05s' }}>
          <Mascot name="buddy" size={50} anim="wiggle" className="shrink-0" />
          <p className="card rounded-bl-md px-4 py-2.5 text-[14px] font-semibold leading-snug">{tip}</p>
        </div>
      </section>

      {/* Tabs */}
      <section className="px-5 mt-5">
        <div className="flex bg-white rounded-full p-1 shadow-card">
          {[['overview', 'Overview'], ['balances', 'Who owes'], ['activity', 'Activity']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={`flex-1 h-10 rounded-full font-bold text-[14px] transition-colors ${tab === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
          ))}
        </div>
      </section>

      {tab === 'overview' && <Overview stats={stats} fm={fm} nameOf={nameOf} byId={byId} />}
      {tab === 'balances' && <Balances stats={stats} group={group} fm={fm} nameOf={nameOf} byId={byId} meId={user.id} onSettle={setSettle} />}
      {tab === 'activity' && <Activity expenses={expenses} fm={fm} nameOf={nameOf} />}

      {/* Floating add button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-5 safe-bottom pt-6 bg-gradient-to-t from-cream via-cream/90 to-cream/0">
          <Button variant="dark" className="w-full pointer-events-auto" onClick={() => navigate(`/group/${group.id}/add`)}>
            <span className="w-7 h-7 rounded-full grad-btn grid place-items-center"><Icon name="camera" size={16} /></span>
            Add expense
          </Button>
        </div>
      </div>

      <CurrencyPicker open={curPicker} onClose={() => setCurPicker(false)} value={showCur} onPick={setViewCur} title="Show amounts in…" note={`Display only. The group still keeps its balances in ${cur}.`} />
      <GroupMenu open={menu} onClose={() => setMenu(false)} group={group} stats={stats} meId={user.id} cur={cur} byId={byId} onInvite={() => { setMenu(false); shareInvite(group, toast) }} />
      <SettleSheet debt={settle} group={group} cur={cur} nameOf={nameOf} byId={byId} onClose={() => setSettle(null)} onDone={() => { setSettle(null); load() }} />
    </Screen>
  )
}

// ---------------- Overview (KPIs) ----------------
function Overview({ stats, fm, nameOf, byId }) {
  if (!stats.count) {
    return (
      <section className="px-5 mt-5">
        <div className="card"><Empty mascot="icecream" title="Nothing here yet">Tap “Add expense” and snap a photo of what you bought.</Empty></div>
      </section>
    )
  }
  const top = stats.categories[0]
  const tiles = [
    { label: 'Your share', value: fm(stats.mySpend, { compact: true }), icon: 'receipt', color: '#FF8A3D', tint: '#FFF1E6' },
    { label: 'You paid', value: fm(stats.myPaid, { compact: true }), icon: 'card', color: '#6C7BFF', tint: '#ECEEFF' },
    { label: 'Transactions', value: stats.count, icon: 'hash', color: '#2BBF6A', tint: '#E6F8EE' },
    { label: 'Avg per bill', value: fm(stats.average, { compact: true }), icon: 'calculator', color: '#E0A800', tint: '#FFF7D6' },
    { label: 'Top spender', value: stats.topPayer ? nameOf(stats.topPayer.id) : '—', icon: 'crown', color: '#FF6FB5', tint: '#FFEAF4', avatar: stats.topPayer && byId(stats.topPayer.id) },
    { label: 'Top category', value: top ? top.name : '—', icon: top ? catInfo(top.name).icon : 'sparkles', color: top ? catInfo(top.name).color : '#A3A3A3', tint: top ? catInfo(top.name).tint : '#F3F3F3' },
  ]
  return (
    <>
      <section className="px-5 mt-5">
        <h2 className="font-display font-bold text-[19px] mb-3">At a glance</h2>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((t, i) => (
            <div key={t.label} className="card p-4 animate-rise" style={{ animationDelay: `${i * 0.03}s` }}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: t.tint, color: t.color }}><Icon name={t.icon} size={15} /></span>
                <span className="text-[13px] font-bold text-ink-soft">{t.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {t.avatar && <Avatar user={t.avatar} size={26} />}
                <p className="font-display font-extrabold text-[22px] leading-tight truncate">{t.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 mt-5">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[17px]">Last 14 days</h3>
            <span className="text-[13px] font-bold text-ink-soft">{fm(stats.days.reduce((s, d) => s + d.amount, 0), { compact: true })}</span>
          </div>
          <SpendChart days={stats.days} fm={fm} />
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="card p-4">
          <h3 className="font-display font-bold text-[17px] mb-3">By category</h3>
          <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5 mb-4">
            {stats.categories.map((c) => <div key={c.name} style={{ width: `${c.share * 100}%`, background: catInfo(c.name).color }} />)}
          </div>
          <div className="flex flex-col gap-3">
            {stats.categories.map((c) => {
              const info = catInfo(c.name)
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl grid place-items-center text-[19px]" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /></span>
                  <div className="flex-1">
                    <div className="flex justify-between font-bold text-[14px]"><span>{c.name}</span><span>{fm(c.amount)}</span></div>
                    <div className="h-2 rounded-full bg-line mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, c.share * 100)}%`, background: info.color }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        <SplitTile title="Cash vs card" a={{ label: 'Cash', icon: 'cash', v: stats.byMethod.cash, c: '#2BBF6A' }} b={{ label: 'Card', icon: 'card', v: stats.byMethod.card, c: '#9B7BFF' }} fm={fm} />
        <SplitTile title="Where" a={{ label: 'In person', icon: 'store', v: stats.byChannel.in_person, c: '#FF8A3D' }} b={{ label: 'Online', icon: 'globe', v: stats.byChannel.online, c: '#3DA9F5' }} fm={fm} />
      </section>
    </>
  )
}

function SplitTile({ title, a, b, fm }) {
  const t = a.v + b.v || 1
  return (
    <div className="card p-4">
      <p className="text-[13px] font-bold text-ink-soft">{title}</p>
      <div className="flex h-2.5 rounded-full overflow-hidden mt-3 bg-line">
        <div style={{ width: `${(a.v / t) * 100}%`, background: a.c }} />
        <div style={{ width: `${(b.v / t) * 100}%`, background: b.c }} />
      </div>
      {[a, b].map((x) => (
        <div key={x.label} className="flex justify-between mt-2.5 text-[12px] font-bold">
          <span className="flex items-center gap-1.5"><Icon name={x.icon} size={14} style={{ color: x.c }} />{x.label}</span><span className="text-ink-soft">{fm(x.v, { compact: true })}</span>
        </div>
      ))}
    </div>
  )
}

function SpendChart({ days, fm }) {
  const [sel, setSel] = useState(days.length - 1)
  const W = 320, H = 120, P = 10
  const max = Math.max(...days.map((d) => d.amount), 1)
  const pts = days.map((d, i) => [P + (i * (W - P * 2)) / (days.length - 1), H - P - (d.amount / max) * (H - P * 2 - 14)])
  const path = pts.reduce((acc, [x, y], i, arr) => {
    if (!i) return `M${x},${y}`
    const [px, py] = arr[i - 1]
    const cx = (px + x) / 2
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')
  const area = `${path} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`
  const [sx, sy] = pts[sel]
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="sl" x1="0" x2="1"><stop offset="0" stopColor="#FF8A3D" /><stop offset=".5" stopColor="#FF6FB5" /><stop offset="1" stopColor="#9B7BFF" /></linearGradient>
          <linearGradient id="sa" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF6FB5" stopOpacity=".22" /><stop offset="1" stopColor="#FF6FB5" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={area} fill="url(#sa)" />
        <path d={path} fill="none" stroke="url(#sl)" strokeWidth="4" strokeLinecap="round" />
        <line x1={sx} x2={sx} y1={sy} y2={H} stroke="#16131c" strokeOpacity=".12" strokeDasharray="3 4" />
        <circle cx={sx} cy={sy} r="7" fill="#fff" stroke="#FF6FB5" strokeWidth="4" />
        {pts.map(([x], i) => <rect key={i} x={x - 11} y={0} width={22} height={H} fill="transparent" onClick={() => setSel(i)} />)}
      </svg>
      <div className="flex justify-between items-center mt-1">
        <span className="text-[12px] font-bold text-ink-faint">{days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span className="bg-cream rounded-full px-3 py-1 text-[12px] font-bold">{days[sel].date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} · {fm(days[sel].amount)}</span>
        <span className="text-[12px] font-bold text-ink-faint">Today</span>
      </div>
    </div>
  )
}

// ---------------- Balances ----------------
function Balances({ stats, group, fm, nameOf, byId, meId, onSettle }) {
  return (
    <>
      <section className="px-5 mt-5">
        <h2 className="font-display font-bold text-[19px] mb-3">Who owes who</h2>
        {stats.debts.length === 0 ? (
          <div className="card"><Empty mascot="flower" title="Everyone’s square!">No one owes anything right now</Empty></div>
        ) : (
          <div className="flex flex-col gap-3">
            {stats.debts.map((d, i) => {
              const mine = d.from === meId || d.to === meId
              return (
                <div key={i} className={`card p-4 animate-rise ${mine ? 'ring-2 ring-pink/40' : ''}`} style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="flex items-center gap-3">
                    <Avatar user={byId(d.from)} size={44} />
                    <div className="flex-1 flex flex-col items-center">
                      <span className="font-display font-extrabold text-[18px]">{fm(d.amount, { decimals: true })}</span>
                      <div className="w-full flex items-center gap-1 text-ink-faint">
                        <span className="flex-1 h-0.5 rounded bg-current opacity-40" />
                        <Icon name="arrow" size={16} />
                      </div>
                    </div>
                    <Avatar user={byId(d.to)} size={44} />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[14px] font-semibold"><b>{nameOf(d.from)}</b> {d.from === meId ? 'owe' : 'owes'} <b>{nameOf(d.to)}</b></p>
                    <button onClick={() => onSettle(d)} className="tap h-9 px-4 rounded-full bg-ink text-white text-[13px] font-bold flex items-center gap-1.5"><Icon name="handshake" size={16} /> Settle</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="px-5 mt-6">
        <h2 className="font-display font-bold text-[19px] mb-3">Balances</h2>
        <div className="card divide-y divide-line">
          {group.members.map((m) => {
            const v = stats.net[m.id] || 0
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar user={m} size={40} />
                <span className="flex-1 font-bold text-[15px] truncate">{m.id === meId ? 'You' : m.name}</span>
                <span className={`font-display font-bold text-[16px] ${v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-ink-faint'}`}>
                  {v > 0 ? '+' : ''}{fm(v, { decimals: true })}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-[12px] text-ink-faint font-semibold mt-2 px-1">Green = gets money back · Red = needs to pay</p>
      </section>
    </>
  )
}

function SettleSheet({ debt, group, cur, nameOf, byId, onClose, onDone }) {
  const [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  if (!debt) return null
  const confirm = async () => {
    setBusy(true)
    try {
      await api.createExpense({
        group_id: group.id, kind: 'settlement', title: `${nameOf(debt.from)} paid ${nameOf(debt.to)}`, category: 'Settle up',
        amount: debt.amount, paid_by: debt.from, splits: [{ user_id: debt.to, amount: debt.amount }], split_mode: 'custom',
        payment_method: method, channel: 'in_person',
      })
      toast('Settled up!')
      onDone()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          <Avatar user={byId(debt.from)} size={56} />
          <span className="w-10 h-10 rounded-full bg-lilac text-purple grid place-items-center"><Icon name="arrow" size={20} /></span>
          <Avatar user={byId(debt.to)} size={56} />
        </div>
        <p className="font-display font-extrabold text-[36px] grad-text mt-3">{money(debt.amount, cur, { decimals: true })}</p>
        <p className="font-semibold text-ink-soft">Mark that <b className="text-ink">{nameOf(debt.from)}</b> paid <b className="text-ink">{nameOf(debt.to)}</b>?</p>
      </div>
      <div className="mt-5">
        <Segmented value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash', icon: 'cash' }, { value: 'card', label: 'Card / e-wallet', icon: 'card' }]} />
      </div>
      <Button variant="grad" className="w-full mt-5 mb-2" loading={busy} onClick={confirm}>Yes, mark as paid</Button>
    </Sheet>
  )
}

// ---------------- Group options: invite, leave, delete ----------------
function GroupMenu({ open, onClose, group, stats, meId, cur, byId, onInvite }) {
  const [confirm, setConfirm] = useState(null) // 'delete' | 'leave'
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { refresh: refreshNotes } = useNotifications()
  const owner = group.created_by === meId
  const net = stats.net[meId] || 0
  const bills = stats.count + (stats.settlementsCount || 0)

  const close = () => { setConfirm(null); onClose() }
  const run = async () => {
    setBusy(true)
    try {
      if (confirm === 'delete') {
        await api.deleteGroup(group.id)
        toast(`Deleted ${group.name}`)
      } else {
        await api.leaveGroup(group.id)
        toast(`You left ${group.name}`)
      }
      close()
      refreshNotes()
      navigate('/', { replace: true })
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close}>
      {!confirm && (
        <div className="pb-2">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0" style={{ background: MASCOTS[group.mascot]?.bg || MASCOTS.buddy.bg }}>
              <img src={`/apps/splitsy/mascots/${MASCOTS[group.mascot] ? group.mascot : 'buddy'}.png`} alt="" className="w-[72%] max-h-[76%] object-contain" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-[19px] truncate">{group.name}</p>
              <p className="text-[13px] font-semibold text-ink-soft">Created by {owner ? 'you' : byId(group.created_by).name} · {group.members.length} members</p>
            </div>
          </div>
          <div className="card divide-y divide-line overflow-hidden">
            <MenuRow icon="share" label="Share invite link" onClick={onInvite} />
            {!owner && <MenuRow icon="logout" label="Leave group" onClick={() => setConfirm('leave')} />}
            {owner && <MenuRow icon="trash" label="Delete group" danger onClick={() => setConfirm('delete')} />}
          </div>
          {!owner && <p className="text-[12px] font-semibold text-ink-faint mt-3 px-1">Only {byId(group.created_by).name} can delete this group.</p>}
        </div>
      )}

      {confirm && (
        <div className="pb-2 text-center">
          <span className="w-16 h-16 rounded-full bg-[#fdecec] text-red grid place-items-center mx-auto"><Icon name={confirm === 'delete' ? 'trash' : 'logout'} size={28} /></span>
          <h3 className="font-display font-bold text-[22px] mt-3">{confirm === 'delete' ? <>Delete “{group.name}”?</> : <>Leave “{group.name}”?</>}</h3>
          <p className="text-ink-soft font-medium mt-1.5 text-[14px]">
            {confirm === 'delete'
              ? <>This removes the group for <b className="text-ink">all {group.members.length} members</b>, including {bills} {bills === 1 ? 'bill' : 'bills'} and every balance. This can’t be undone.</>
              : 'You won’t see this group anymore. Your past bills stay in the group for the others.'}
          </p>
          {Math.abs(net) >= 0.01 && (
            <div className="mt-4 rounded-2xl bg-[#FFF7D6] px-4 py-3 text-[13px] font-semibold text-left flex items-start gap-2">
              <Icon name="alert" size={16} className="text-[#E0A800] shrink-0 mt-0.5" />
              <span>{net > 0 ? `You’re still owed ${money(net, cur, { decimals: true })}.` : `You still owe ${money(-net, cur, { decimals: true })}.`} You may want to settle up first.</span>
            </div>
          )}
          <div className="flex gap-2 mt-5">
            <Button variant="soft" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" className="flex-1 !bg-red !text-white" loading={busy} onClick={run}>{confirm === 'delete' ? 'Delete group' : 'Leave group'}</Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function MenuRow({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className={`tap w-full flex items-center gap-3 px-4 py-3.5 text-left font-bold text-[15px] ${danger ? 'text-red' : ''}`}>
      <span className={`w-9 h-9 rounded-xl grid place-items-center ${danger ? 'bg-[#fdecec]' : 'bg-cream'}`}><Icon name={icon} size={18} /></span>
      <span className="flex-1">{label}</span>
      <Icon name="chevron" size={18} className="text-ink-faint" />
    </button>
  )
}

// ---------------- Activity ----------------
function Activity({ expenses, fm, nameOf }) {
  if (!expenses.length) {
    return <section className="px-5 mt-5"><div className="card"><Empty mascot="bear" title="No activity yet">Your transactions will show up here.</Empty></div></section>
  }
  const groups = []
  for (const e of expenses) {
    const day = relDay(e.created_at)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(e)
    else groups.push({ day, items: [e] })
  }
  return (
    <section className="px-5 mt-5 flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.day}>
          <p className="text-[13px] font-bold text-ink-faint uppercase tracking-wider mb-2 px-1">{g.day}</p>
          <div className="card divide-y divide-line overflow-hidden">
            {g.items.map((e) => <ExpenseRow key={e.id} e={e} fm={fm} nameOf={nameOf} />)}
          </div>
        </div>
      ))}
    </section>
  )
}

export function ExpenseRow({ e, fm, nameOf }) {
  const info = catInfo(e.category)
  const settle = e.kind === 'settlement'
  return (
    <button onClick={() => navigate(`/expense/${e.id}`)} className="tap w-full flex items-center gap-3 px-4 py-3 text-left">
      {e.photos?.[0] && !settle ? (
        <img src={e.photos[0]} alt="" className="w-12 h-12 rounded-2xl object-cover shrink-0" />
      ) : (
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-[22px] shrink-0" style={{ background: info.tint }}><Icon name={info.icon} size="1em" style={{ color: info.color }} /></span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[15px] truncate">{e.title}</p>
        <p className="text-[12px] font-semibold text-ink-soft truncate">
          {settle ? 'Settlement' : `${nameOf(e.paid_by)} paid`}{e.items?.length ? ` · ${e.items.length} items` : ''} · {new Date(e.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          {e.place_name ? ` · ${e.place_name}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-display font-bold text-[16px] ${settle ? 'text-green' : ''}`}>{fm(e.amount)}</p>
        {e.original_currency && <p className="text-[11px] font-bold text-purple">paid {money(e.original_amount, e.original_currency)}</p>}
        <p className="text-[11px] font-bold text-ink-faint flex items-center justify-end gap-1"><Icon name={e.payment_method === 'card' ? 'card' : 'cash'} size={12} /> {e.channel === 'online' ? 'Online' : 'In person'}</p>
      </div>
    </button>
  )
}

