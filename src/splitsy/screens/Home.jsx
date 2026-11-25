import { useEffect, useState } from 'react'
import { Screen, Mascot, Avatar, AvatarStack, Button, Sheet, Empty, MASCOTS, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { greeting, firstName, money } from '../lib/format'
import { CurrencyPicker, CurrencyChip, useRates, useViewCurrency } from '../components/CurrencyPicker'
import { rateBetween } from '../lib/currency'

export default function Home() {
  const { user } = useAuth()
  const [groups, setGroups] = useState(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [curPicker, setCurPicker] = useState(false)
  const [homeCur, setHomeCur] = useViewCurrency('home', null)
  const toast = useToast()

  useEffect(() => {
    api.listGroups().then(setGroups).catch((e) => {
      toast(e.message, 'error')
      setGroups([])
    })
  }, [toast])

  const currency = homeCur || groups?.[0]?.currency || 'PHP'
  const mixed = (groups || []).some((g) => g.currency !== currency)
  const { rates } = useRates(mixed)
  // Convert every group's total into one currency so the sum makes sense
  let total = 0
  let missing = false
  for (const g of groups || []) {
    const r = rateBetween(rates, g.currency, currency)
    if (g.currency === currency) total += g.total
    else if (r) total += g.total * r
    else if (g.total) missing = true
  }

  return (
    <Screen className="pb-28">
      <header className="safe-top px-5 pt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/apps/splitsy/icon-192.png" alt="" className="w-9 h-9 rounded-xl" />
          <span className="font-display font-extrabold text-[22px] tracking-tight">Splitsy</span>
        </div>
        <button className="tap" onClick={() => navigate('/profile')} aria-label="Profile">
          <Avatar user={user} size={44} ring />
        </button>
      </header>

      <section className="px-5 mt-6 animate-rise">
        <p className="text-ink-soft font-semibold text-[15px]">{greeting()}, {firstName(user?.name)}</p>
        <h1 className="font-display font-extrabold text-[34px] leading-[1.05] tracking-tight mt-1">
          Who are we <span className="grad-text">splitting</span>
          <br /> with today?
        </h1>
      </section>

      {/* Hero summary card */}
      <section className="px-5 mt-5">
        <div className="relative rounded-[30px] grad-warm p-5 overflow-hidden shadow-pop animate-rise" style={{ animationDelay: '.05s' }}>
          <Mascot name="buddy" size={118} className="absolute -right-2 -bottom-3" />
          <p className="text-white/85 font-bold text-[13px] uppercase tracking-wider">Across all groups</p>
          <p className="font-display font-extrabold text-white text-[40px] leading-tight mt-1">{groups ? money(total, currency) : '—'}</p>
          <p className="text-white/90 font-semibold text-[14px] pr-24">
            {groups ? `${groups.length} group${groups.length === 1 ? '' : 's'}${mixed ? (missing ? ' · some rates missing' : ' · converted') : ' · fair & square'}` : 'Loading…'}
          </p>
          <div className="mt-2 relative"><CurrencyChip code={currency} dark onClick={() => setCurPicker(true)} /></div>
          <div className="flex gap-2 mt-4 relative">
            <button onClick={() => navigate('/new-group')} className="tap h-11 px-4 rounded-full bg-white text-ink font-bold text-[14px] flex items-center gap-1.5">
              <Icon name="plus" size={18} /> New group
            </button>
            <button onClick={() => setJoinOpen(true)} className="tap h-11 px-4 rounded-full bg-white/25 text-white font-bold text-[14px] flex items-center gap-1.5 backdrop-blur">
              <Icon name="link" size={17} /> Join
            </button>
          </div>
        </div>
      </section>

      <section className="px-5 mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-[20px]">Your groups</h2>
          {groups?.length > 0 && <span className="text-[13px] font-bold text-ink-faint">{groups.length}</span>}
        </div>

        {!groups && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[92px]" />)}
          </div>
        )}

        {groups?.length === 0 && (
          <div className="card">
            <Empty mascot="cloudpurple" title="No groups yet">
              Make one for your barkada trip, roommates or office lunch — then share the link!
              <div className="mt-4">
                <Button size="md" onClick={() => navigate('/new-group')}><Icon name="plus" size={18} /> Create a group</Button>
              </div>
            </Empty>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {groups?.map((g, i) => (
            <button key={g.id} onClick={() => navigate(`/group/${g.id}`)} className="tap card p-3 pr-4 flex items-center gap-3 text-left animate-rise" style={{ animationDelay: `${0.05 * i}s` }}>
              <div className="w-[68px] h-[68px] rounded-[22px] grid place-items-center shrink-0" style={{ background: MASCOTS[g.mascot]?.bg || MASCOTS.buddy.bg }}>
                <img src={`/apps/splitsy/mascots/${g.mascot || 'buddy'}.png`} alt="" className="w-[52px] max-h-[56px] object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-[17px] truncate">{g.name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AvatarStack users={g.members} size={24} />
                  <span className="text-[12px] font-semibold text-ink-soft">{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-[16px]">{money(g.total, g.currency, { compact: true })}</p>
                <p className="text-[11px] font-semibold text-ink-faint">spent</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
      <CurrencyPicker open={curPicker} onClose={() => setCurPicker(false)} value={currency} onPick={setHomeCur} title="Show totals in…" note="Groups in other currencies are converted at today’s rate." />
    </Screen>
  )
}

function JoinSheet({ open, onClose }) {
  const [value, setValue] = useState('')
  const code = (value.match(/join\/([A-Za-z0-9]+)/)?.[1] || value).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <Mascot name="thumb" size={64} anim="wiggle" />
        <div>
          <h3 className="font-display font-bold text-[20px]">Join a group</h3>
          <p className="text-[14px] text-ink-soft font-medium">Paste the invite link or code from your friend.</p>
        </div>
      </div>
      <input autoFocus className="field uppercase tracking-widest" placeholder="Link or code" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button className="w-full mt-4 mb-2" disabled={code.length < 6} onClick={() => { onClose(); navigate(`/join/${code}`) }}>
        Join group <Icon name="arrow" size={18} />
      </Button>
    </Sheet>
  )
}
