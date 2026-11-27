import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, Sheet, Spinner, Empty, Mascot, MASCOTS, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { CurrencyPicker, CurrencyChip, useRates, useViewCurrency } from '../components/CurrencyPicker'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { adminStats } from '../lib/adminStats'
import { catInfo } from '../lib/categories'
import { money, relDay, dateTime } from '../lib/format'

// Chart colors (validated categorical slots 1 & 2; slot 2 always ships with a visible label)
const C1 = '#257de0'
const C2 = '#f47230'
const TABS = [['overview', 'Overview'], ['users', 'Users'], ['groups', 'Groups'], ['txns', 'Transactions']]

export default function Admin() {
  const { user, isAdmin, ready } = useAuth()
  const toast = useToast()
  const [raw, setRaw] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [view, setView] = useViewCurrency('admin', 'PHP')
  const [curPicker, setCurPicker] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRaw(await api.adminData())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const needRates = Boolean(raw?.groups.some((g) => g.currency !== view))
  const { rates } = useRates(needRates)
  const stats = useMemo(() => (raw ? adminStats(raw, view, rates) : null), [raw, view, rates])

  if (ready && user && !isAdmin) {
    return (
      <div className="min-h-[100dvh] grid place-items-center px-6 text-center">
        <div>
          <Mascot name="cloudpink" size={130} />
          <h1 className="font-display font-extrabold text-[26px] mt-4">Superadmins only</h1>
          <p className="text-ink-soft font-medium mt-1">Your account doesn’t have access to the admin dashboard.</p>
          <Button className="mt-6" onClick={() => navigate('/', { replace: true })}>Back to Splitsy</Button>
        </div>
      </div>
    )
  }

  const fm = (v, o) => money(v, view, o)

  return (
    <div className="min-h-[100dvh] w-full max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl safe-top">
        <div className="px-4 md:px-8 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Back to app"><Icon name="back" /></button>
          <img src="/apps/splitsy/logo.svg" alt="" className="w-9 h-8 object-contain" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-[18px] leading-none truncate">Splitsy Admin</p>
            <p className="text-[11px] font-bold text-purple flex items-center gap-1 mt-0.5"><Icon name="crown" size={12} /> Superadmin</p>
          </div>
          <span className="hidden sm:block"><CurrencyChip code={view} onClick={() => setCurPicker(true)} /></span>
          <button onClick={load} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Refresh">
            {loading ? <Spinner size={18} /> : <Icon name="refresh" size={18} />}
          </button>
        </div>
        <div className="px-4 md:px-8 pb-3 flex items-center gap-2">
          <div className="flex bg-white rounded-full p-1 shadow-card overflow-x-auto no-scrollbar flex-1 md:flex-none">
            {TABS.map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={`shrink-0 h-9 px-4 rounded-full font-bold text-[13px] transition-colors ${tab === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{l}</button>
            ))}
          </div>
          <span className="sm:hidden shrink-0"><CurrencyChip code={view} onClick={() => setCurPicker(true)} /></span>
        </div>
      </div>

      <div className="px-4 md:px-8">
        {error && (
          <div className="card p-5 mt-4 flex items-start gap-3">
            <Icon name="alert" className="text-red shrink-0" />
            <div>
              <p className="font-bold">Couldn’t load admin data</p>
              <p className="text-[13px] text-ink-soft font-medium">{error}. If you just set up Supabase, run the latest <code>supabase/schema.sql</code> again.</p>
            </div>
          </div>
        )}
        {!stats && !error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-28" />)}</div>
        )}
        {stats && tab === 'overview' && <Overview s={stats} fm={fm} view={view} />}
        {stats && tab === 'users' && <Users s={stats} fm={fm} me={user.id} onChanged={load} toast={toast} />}
        {stats && tab === 'groups' && <Groups s={stats} fm={fm} onChanged={load} toast={toast} />}
        {stats && tab === 'txns' && <Transactions s={stats} raw={raw} />}
      </div>

      <CurrencyPicker open={curPicker} onClose={() => setCurPicker(false)} value={view} onPick={setView} title="Show money in…" note="Groups in other currencies are converted at today’s rate." />
    </div>
  )
}

// ======================= Overview =======================
function Overview({ s, fm, view }) {
  const kpis = [
    { label: 'Users', value: s.users.toLocaleString(), sub: `+${s.newUsers7} this week`, icon: 'users' },
    { label: 'Active users (7d)', value: s.active7.toLocaleString(), sub: s.users ? `${Math.round((s.active7 / s.users) * 100)}% of all users` : '—', icon: 'smile' },
    { label: 'Groups', value: s.groups.toLocaleString(), sub: `${s.avgMembers.toFixed(1)} members avg`, icon: 'party' },
    { label: 'Transactions', value: s.txns.toLocaleString(), sub: `+${s.txns7} this week`, icon: 'receipt' },
    { label: 'Total volume', value: fm(s.volume, { compact: true }), sub: s.unconverted ? `${s.unconverted} not converted` : `in ${view}`, icon: 'wallet' },
    { label: 'Avg transaction', value: fm(s.average, { compact: true }), sub: 'per bill', icon: 'calculator' },
    { label: 'Receipts scanned', value: s.receipts.toLocaleString(), sub: s.txns ? `${Math.round((s.receipts / s.txns) * 100)}% of bills` : '—', icon: 'scan' },
    { label: 'Settle-ups', value: s.settlements.toLocaleString(), sub: `${s.foreign} foreign-currency bills`, icon: 'handshake' },
  ]
  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={k.label} className="card p-4 animate-rise" style={{ animationDelay: `${i * 0.02}s` }}>
            <div className="flex items-center gap-2 text-ink-soft">
              <span className="w-7 h-7 rounded-lg bg-cream grid place-items-center text-ink"><Icon name={k.icon} size={15} /></span>
              <span className="text-[12px] font-bold">{k.label}</span>
            </div>
            <p className="font-display font-extrabold text-[26px] leading-tight mt-2 truncate">{k.value}</p>
            <p className="text-[12px] font-semibold text-ink-faint truncate">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Transactions per day" sub="Last 30 days">
          <LineChart days={s.days} valueKey="txns" color={C1} format={(v) => `${v} ${v === 1 ? 'bill' : 'bills'}`} />
        </ChartCard>
        <ChartCard title="New users per day" sub="Last 30 days">
          <LineChart days={s.days} valueKey="signups" color={C1} format={(v) => `${v} sign-up${v === 1 ? '' : 's'}`} />
        </ChartCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Spending by category" sub={`All groups, in ${view}`}>
          {s.categories.length ? <BarList rows={s.categories.map((c) => ({ label: c.name, value: c.value, icon: catInfo(c.name).icon }))} format={(v) => fm(v, { compact: true })} /> : <p className="text-ink-soft text-[14px] font-medium py-6 text-center">No spending yet</p>}
        </ChartCard>
        <div className="flex flex-col gap-4">
          <ChartCard title="How people pay">
            <SplitBar a={{ label: 'Cash', value: s.method.cash }} b={{ label: 'Card / e-wallet', value: s.method.card }} format={(v) => fm(v, { compact: true })} />
          </ChartCard>
          <ChartCard title="Where they buy">
            <SplitBar a={{ label: 'In person', value: s.channel.in_person }} b={{ label: 'Online', value: s.channel.online }} format={(v) => fm(v, { compact: true })} />
          </ChartCard>
          <ChartCard title="Group currencies">
            <div className="flex flex-wrap gap-2">
              {s.currencies.length ? s.currencies.map(([c, n]) => (
                <span key={c} className="h-8 px-3 rounded-full bg-cream text-[13px] font-bold inline-flex items-center gap-1.5">{c} <span className="text-ink-faint">{n}</span></span>
              )) : <span className="text-ink-soft text-[14px] font-medium">No groups yet</span>}
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Top groups" sub="By total spending">
          <RankList rows={s.topGroups.map((g) => ({ id: g.id, left: <MascotTile g={g} size={36} />, title: g.name, sub: `${g.members} ${g.members === 1 ? 'member' : 'members'} · ${g.txns} ${g.txns === 1 ? 'bill' : 'bills'}`, value: fm(g.totalView, { compact: true }) }))} empty="No groups yet" />
        </ChartCard>
        <ChartCard title="Top spenders" sub="By amount paid">
          <RankList rows={s.topSpenders.filter((u) => u.paid > 0).map((u) => ({ id: u.id, left: <Avatar user={u} size={36} />, title: u.name, sub: u.email, value: fm(u.paid, { compact: true }) }))} empty="No payments yet" />
        </ChartCard>
      </div>
    </div>
  )
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-display font-bold text-[17px]">{title}</h3>
        {sub && <span className="text-[12px] font-semibold text-ink-faint">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

/** Single-series line with a crosshair + tooltip on hover/tap. */
function LineChart({ days, valueKey, color, format }) {
  const [hover, setHover] = useState(null)
  const ref = useRef(null)
  const W = 600, H = 170, PL = 28, PR = 10, PT = 12, PB = 22
  const vals = days.map((d) => d[valueKey])
  const max = Math.max(1, ...vals)
  const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4
  const x = (i) => PL + (i * (W - PL - PR)) / (days.length - 1)
  const y = (v) => PT + (1 - v / nice) * (H - PT - PB)
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${path} L${x(days.length - 1)},${H - PB} L${x(0)},${H - PB} Z`
  const total = vals.reduce((a, b) => a + b, 0)

  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - PL) / (W - PL - PR)) * (days.length - 1))))
    setHover(i)
  }
  const hi = hover ?? null
  return (
    <div className="relative">
      <p className="text-[13px] font-semibold text-ink-soft -mt-1 mb-1">{format(total)} total</p>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${format(total)} in the last 30 days`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(nice * t)} y2={y(nice * t)} stroke="#16131c" strokeOpacity="0.07" />
            <text x={PL - 6} y={y(nice * t) + 4} textAnchor="end" fontSize="11" fill="#a9a4b4" fontWeight="600">{Math.round(nice * t)}</text>
          </g>
        ))}
        <path d={area} fill={color} fillOpacity="0.08" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {[0, 14, 29].map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === 29 ? 'end' : 'middle'} fontSize="11" fill="#a9a4b4" fontWeight="600">
            {i === 29 ? 'Today' : days[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
        {hi != null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={PT} y2={H - PB} stroke="#16131c" strokeOpacity="0.25" strokeDasharray="3 3" />
            <circle cx={x(hi)} cy={y(vals[hi])} r="5" fill={color} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hi != null && (
        <div className="absolute top-6 pointer-events-none bg-ink text-white rounded-xl px-3 py-1.5 text-[12px] font-bold shadow-ink whitespace-nowrap" style={{ left: `${(x(hi) / W) * 100}%`, transform: `translateX(${hi > 22 ? '-100%' : hi < 7 ? '0' : '-50%'})` }}>
          {days[hi].date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {format(vals[hi])}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars, one hue (magnitude), every bar labelled. */
function BarList({ rows, format }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const [hover, setHover] = useState(null)
  return (
    <div className="flex flex-col gap-2.5">
      {rows.slice(0, 8).map((r, i) => (
        <div key={r.label} className="flex items-center gap-3" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
          <span className="w-28 shrink-0 flex items-center gap-1.5 text-[13px] font-bold truncate"><Icon name={r.icon} size={14} className="text-ink-soft shrink-0" />{r.label}</span>
          <div className="flex-1 h-5 relative">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: C1, opacity: hover == null || hover === i ? 1 : 0.45 }} title={`${r.label}: ${format(r.value)}`} />
          </div>
          <span className="w-16 text-right text-[13px] font-bold text-ink">{format(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Two-part share bar with a legend + direct labels (slot 2 needs the label for contrast). */
function SplitBar({ a, b, format }) {
  const t = a.value + b.value
  const pa = t ? a.value / t : 0
  if (!t) return <p className="text-ink-soft text-[14px] font-medium">No spending yet</p>
  return (
    <div>
      <div className="flex h-4 gap-[2px]">
        {pa > 0 && <div className="h-full rounded-l-[4px]" style={{ width: `${pa * 100}%`, background: C1, borderTopRightRadius: pa === 1 ? 4 : 0, borderBottomRightRadius: pa === 1 ? 4 : 0 }} title={`${a.label}: ${format(a.value)}`} />}
        {pa < 1 && <div className="h-full rounded-r-[4px]" style={{ width: `${(1 - pa) * 100}%`, background: C2, borderTopLeftRadius: pa === 0 ? 4 : 0, borderBottomLeftRadius: pa === 0 ? 4 : 0 }} title={`${b.label}: ${format(b.value)}`} />}
      </div>
      <div className="flex justify-between mt-2.5 text-[13px] font-bold">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C1 }} />{a.label} · {Math.round(pa * 100)}% <span className="text-ink-faint font-semibold">{format(a.value)}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C2 }} />{b.label} · {Math.round((1 - pa) * 100)}% <span className="text-ink-faint font-semibold">{format(b.value)}</span></span>
      </div>
    </div>
  )
}

function RankList({ rows, empty }) {
  if (!rows.length) return <p className="text-ink-soft text-[14px] font-medium py-4 text-center">{empty}</p>
  return (
    <div className="flex flex-col divide-y divide-line">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 py-2.5">
          <span className="w-5 text-[13px] font-bold text-ink-faint">{i + 1}</span>
          {r.left}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px] truncate">{r.title}</p>
            <p className="text-[12px] font-semibold text-ink-faint truncate">{r.sub}</p>
          </div>
          <span className="font-display font-bold text-[15px]">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

const MascotTile = ({ g, size = 44 }) => (
  <span className="rounded-xl grid place-items-center shrink-0" style={{ width: size, height: size, background: MASCOTS[g.mascot]?.bg || MASCOTS.buddy.bg }}>
    <img src={`/apps/splitsy/mascots/${MASCOTS[g.mascot] ? g.mascot : 'buddy'}.png`} alt="" className="w-[72%] max-h-[76%] object-contain" />
  </span>
)

function SearchBar({ value, onChange, placeholder, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 mt-4">
      <div className="relative flex-1">
        <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field h-12 pl-11" />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">{children}</div>
    </div>
  )
}

const Chip = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`tap shrink-0 h-10 px-3.5 rounded-full border-2 font-bold text-[13px] ${on ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{children}</button>
)

const ago = (iso) => (iso ? relDay(iso) : '—')

// ======================= Users =======================
function Users({ s, fm, me, onChanged, toast }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('new')
  const [open, setOpen] = useState(null)
  const query = q.trim().toLowerCase()
  const rows = s.userRows
    .filter((u) => !query || u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query))
    .sort((a, b) => (sort === 'new' ? (b.created_at || '').localeCompare(a.created_at || '') : sort === 'active' ? (b.lastActive || '').localeCompare(a.lastActive || '') : b.paid - a.paid))
  const sel = open && s.userRows.find((u) => u.id === open)

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search name or email">
        <Chip on={sort === 'new'} onClick={() => setSort('new')}>Newest</Chip>
        <Chip on={sort === 'active'} onClick={() => setSort('active')}>Recently active</Chip>
        <Chip on={sort === 'paid'} onClick={() => setSort('paid')}>Top payers</Chip>
      </SearchBar>
      <p className="text-[12px] font-bold text-ink-faint mt-3 mb-2 px-1">{rows.length} of {s.users} users</p>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((u) => (
          <button key={u.id} onClick={() => setOpen(u.id)} className="tap w-full flex items-center gap-3 px-4 py-3 text-left">
            <Avatar user={u} size={42} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] truncate flex items-center gap-1.5">{u.name}{u.is_admin && <Icon name="crown" size={14} className="text-purple shrink-0" />}{u.id === me && <span className="text-[11px] text-ink-faint">(you)</span>}</p>
              <p className="text-[12px] font-semibold text-ink-faint truncate">{u.email || '—'}</p>
            </div>
            <div className="hidden md:block w-28 text-[12px] font-semibold text-ink-soft">Joined {ago(u.created_at)}</div>
            <div className="hidden md:block w-32 text-[12px] font-semibold text-ink-soft">Active {ago(u.lastActive)}</div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-[15px]">{fm(u.paid, { compact: true })}</p>
              <p className="text-[11px] font-bold text-ink-faint">{u.groups} {u.groups === 1 ? 'group' : 'groups'} · {u.txns} {u.txns === 1 ? 'bill' : 'bills'}</p>
            </div>
          </button>
        ))}
        {!rows.length && <Empty mascot="cloudpurple" title="No users found">Try a different search.</Empty>}
      </div>

      <Sheet open={Boolean(sel)} onClose={() => setOpen(null)}>
        {sel && <UserDetail u={sel} s={s} fm={fm} me={me} onChanged={() => { setOpen(null); onChanged() }} toast={toast} />}
      </Sheet>
    </>
  )
}

function UserDetail({ u, s, fm, me, onChanged, toast }) {
  const [busy, setBusy] = useState(false)
  const groups = s.groupRows.filter((g) => g.memberIds.includes(u.id))
  const toggleAdmin = async () => {
    setBusy(true)
    try {
      await api.adminSetAdmin(u.id, !u.is_admin)
      toast(u.is_admin ? `${u.name} is no longer a superadmin` : `${u.name} is now a superadmin`)
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="pb-2">
      <div className="flex items-center gap-3">
        <Avatar user={u} size={60} />
        <div className="min-w-0">
          <p className="font-display font-bold text-[21px] truncate flex items-center gap-1.5">{u.name}{u.is_admin && <Icon name="crown" size={17} className="text-purple" />}</p>
          <p className="text-[13px] font-semibold text-ink-soft truncate">{u.email}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Mini label="Groups" value={u.groups} />
        <Mini label="Bills added" value={u.txns} />
        <Mini label="Paid" value={fm(u.paid, { compact: true })} />
      </div>
      <div className="mt-4 text-[13px] font-semibold text-ink-soft flex flex-col gap-1">
        <span className="flex items-center gap-2"><Icon name="clock" size={14} /> Joined {u.created_at ? dateTime(u.created_at) : '—'}</span>
        <span className="flex items-center gap-2"><Icon name="smile" size={14} /> Last active {u.lastActive ? dateTime(u.lastActive) : '—'}</span>
      </div>
      <p className="font-bold text-[14px] mt-5 mb-2">Groups</p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-3 bg-white rounded-2xl p-2.5">
            <MascotTile g={g} size={36} />
            <span className="flex-1 font-bold text-[14px] truncate">{g.name}</span>
            <span className="text-[12px] font-bold text-ink-faint">{g.members} members</span>
          </div>
        ))}
        {!groups.length && <p className="text-[13px] text-ink-faint font-semibold">Not in any group</p>}
      </div>
      <Button variant={u.is_admin ? 'soft' : 'dark'} className="w-full mt-5" loading={busy} disabled={u.is_admin && u.id === me} onClick={toggleAdmin}>
        <Icon name="crown" size={18} /> {u.is_admin ? (u.id === me ? 'You’re a superadmin' : 'Remove superadmin') : 'Make superadmin'}
      </Button>
    </div>
  )
}

const Mini = ({ label, value }) => (
  <div className="bg-white rounded-2xl p-3 text-center">
    <p className="font-display font-extrabold text-[18px] truncate">{value}</p>
    <p className="text-[11px] font-bold text-ink-faint">{label}</p>
  </div>
)

// ======================= Groups =======================
function Groups({ s, fm, onChanged, toast }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('new')
  const [open, setOpen] = useState(null)
  const query = q.trim().toLowerCase()
  const rows = s.groupRows
    .filter((g) => !query || g.name.toLowerCase().includes(query) || g.owner.toLowerCase().includes(query) || g.invite_code?.toLowerCase().includes(query))
    .sort((a, b) => (sort === 'new' ? (b.created_at || '').localeCompare(a.created_at || '') : sort === 'big' ? b.totalView - a.totalView : (b.lastActivity || '').localeCompare(a.lastActivity || '')))
  const sel = open && s.groupRows.find((g) => g.id === open)
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search group, owner or invite code">
        <Chip on={sort === 'new'} onClick={() => setSort('new')}>Newest</Chip>
        <Chip on={sort === 'big'} onClick={() => setSort('big')}>Biggest</Chip>
        <Chip on={sort === 'active'} onClick={() => setSort('active')}>Recently active</Chip>
      </SearchBar>
      <p className="text-[12px] font-bold text-ink-faint mt-3 mb-2 px-1">{rows.length} of {s.groups} groups</p>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((g) => (
          <button key={g.id} onClick={() => setOpen(g.id)} className="tap w-full flex items-center gap-3 px-4 py-3 text-left">
            <MascotTile g={g} size={44} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] truncate">{g.name}</p>
              <p className="text-[12px] font-semibold text-ink-faint truncate">by {g.owner} · {g.members} members · {g.txns} bills</p>
            </div>
            <div className="hidden md:block w-32 text-[12px] font-semibold text-ink-soft">Active {ago(g.lastActivity)}</div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-[15px]">{money(g.total, g.currency, { compact: true })}</p>
              <p className="text-[11px] font-bold text-ink-faint">{g.currency}</p>
            </div>
          </button>
        ))}
        {!rows.length && <Empty mascot="cloudpurple" title="No groups found">Try a different search.</Empty>}
      </div>
      <Sheet open={Boolean(sel)} onClose={() => setOpen(null)}>
        {sel && <GroupDetail g={sel} s={s} fm={fm} onChanged={() => { setOpen(null); onChanged() }} toast={toast} />}
      </Sheet>
    </>
  )
}

function GroupDetail({ g, s, fm, onChanged, toast }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const del = async () => {
    setBusy(true)
    try {
      await api.adminDeleteGroup(g.id)
      toast(`Deleted ${g.name}`)
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="pb-2">
      <div className="flex items-center gap-3">
        <MascotTile g={g} size={60} />
        <div className="min-w-0">
          <p className="font-display font-bold text-[21px] truncate">{g.name}</p>
          <p className="text-[13px] font-semibold text-ink-soft">Created by {g.owner} · {g.created_at ? relDay(g.created_at) : '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Mini label="Members" value={g.members} />
        <Mini label="Bills" value={g.txns} />
        <Mini label={`Total (${g.currency})`} value={money(g.total, g.currency, { compact: true })} />
      </div>
      <p className="text-[13px] font-semibold text-ink-soft mt-3 flex items-center gap-2"><Icon name="link" size={14} /> Invite code <b className="text-ink tracking-wider">{g.invite_code}</b></p>
      <p className="font-bold text-[14px] mt-5 mb-2">Members</p>
      <div className="flex flex-wrap gap-2">
        {g.memberIds.map((id) => {
          const u = s.userById[id] || { id, name: 'Unknown' }
          return <span key={id} className="flex items-center gap-1.5 bg-white rounded-full pl-1 pr-3 py-1 text-[13px] font-bold"><Avatar user={u} size={24} />{u.name}</span>
        })}
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="soft" className="flex-1" onClick={() => navigate(`/group/${g.id}`)}><Icon name="eye" size={18} /> Open</Button>
        <Button variant="danger" className="flex-1" onClick={() => setConfirm(true)}><Icon name="trash" size={18} /> Delete</Button>
      </div>
      {confirm && (
        <div className="mt-4 rounded-2xl bg-[#fdecec] p-4">
          <p className="font-bold text-[14px] text-red">Delete “{g.name}” for everyone?</p>
          <p className="text-[13px] font-semibold text-ink-soft mt-1">Its {g.txns} bills and all balances will be removed. This can’t be undone.</p>
          <div className="flex gap-2 mt-3">
            <Button variant="muted" size="md" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" size="md" className="flex-1 !bg-red !text-white" loading={busy} onClick={del}>Yes, delete</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ======================= Transactions =======================
const FILTERS = [['all', 'All'], ['expense', 'Bills'], ['receipt', 'Receipts'], ['foreign', 'Foreign currency'], ['settlement', 'Settle-ups']]

function Transactions({ s, raw }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(50)
  const query = q.trim().toLowerCase()
  const rows = raw.expenses
    .filter((e) => {
      if (filter === 'expense' && e.kind === 'settlement') return false
      if (filter === 'settlement' && e.kind !== 'settlement') return false
      if (filter === 'receipt' && !e.items?.length) return false
      if (filter === 'foreign' && !e.original_currency) return false
      if (!query) return true
      const g = s.groupById[e.group_id]
      const payer = s.userById[e.paid_by]
      return [e.ref, e.title, e.category, e.place_name, g?.name, payer?.name].some((v) => v?.toLowerCase().includes(query))
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <>
      <SearchBar value={q} onChange={(v) => { setQ(v); setLimit(50) }} placeholder="Search ID (SPL-…), title, group, payer or place">
        {FILTERS.map(([v, l]) => <Chip key={v} on={filter === v} onClick={() => { setFilter(v); setLimit(50) }}>{l}</Chip>)}
      </SearchBar>
      <p className="text-[12px] font-bold text-ink-faint mt-3 mb-2 px-1">{rows.length} transactions</p>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.slice(0, limit).map((e) => {
          const g = s.groupById[e.group_id]
          const info = catInfo(e.category)
          const settle = e.kind === 'settlement'
          return (
            <button key={e.id} onClick={() => navigate(`/expense/${e.id}`)} className="tap w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: info.tint, color: info.color }}><Icon name={info.icon} size={20} /></span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] truncate">{e.title}</p>
                <p className="text-[12px] font-semibold text-ink-faint truncate">
                  <span className="font-mono">{e.ref}</span> · {g?.name || 'Deleted group'} · {s.userById[e.paid_by]?.name || '—'} paid
                </p>
              </div>
              <div className="hidden md:flex w-36 gap-1.5 text-ink-soft">
                {e.items?.length > 0 && <Badge icon="receipt">{e.items.length}</Badge>}
                {e.original_currency && <Badge icon="convert">{e.original_currency}</Badge>}
                {e.photos?.length > 0 && <Badge icon="image">{e.photos.length}</Badge>}
              </div>
              <div className="text-right shrink-0">
                <p className={`font-display font-bold text-[15px] ${settle ? 'text-green' : ''}`}>{money(e.amount, g?.currency || 'PHP')}</p>
                <p className="text-[11px] font-bold text-ink-faint">{dateTime(e.created_at)}</p>
              </div>
            </button>
          )
        })}
        {!rows.length && <Empty mascot="bear" title="No transactions found">Try another search or filter.</Empty>}
      </div>
      {rows.length > limit && <Button variant="soft" className="w-full mt-3" onClick={() => setLimit(limit + 50)}>Show more ({rows.length - limit} left)</Button>}
    </>
  )
}

const Badge = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-cream text-[11px] font-bold"><Icon name={icon} size={12} />{children}</span>
)
