import { useEffect } from 'react'
import { Screen, TopBar, Avatar, Empty } from '../components/ui'
import Icon from '../components/Icon'
import PushCard from '../components/PushCard'
import { useNotifications } from '../notifications'
import { navigate } from '../lib/router'
import { money, timeAgo, relDay } from '../lib/format'

export default function Notifications() {
  const { items, unread, markRead, refresh } = useNotifications()
  useEffect(() => { refresh() }, [refresh])

  const groups = []
  for (const n of items) {
    const day = relDay(n.created_at)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(n)
    else groups.push({ day, items: [n] })
  }

  return (
    <Screen className="pb-10">
      <TopBar title="Notifications" right={unread > 0 && <button onClick={() => markRead()} className="text-[13px] font-bold text-pink px-2">Mark all read</button>} />
      <section className="px-5 pt-2"><PushCard /></section>
      {items.length === 0 ? (
        <section className="px-5 mt-5"><div className="card"><Empty mascot="cloudpurple" title="All quiet here">When someone in your groups adds a bill or settles up, you’ll see it here.</Empty></div></section>
      ) : (
        <section className="px-5 mt-5 flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="text-[13px] font-bold text-ink-faint uppercase tracking-wider mb-2 px-1">{g.day}</p>
              <div className="card divide-y divide-line overflow-hidden">
                {g.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.read_at) markRead([n.id]); if (n.expense_id) navigate(`/expense/${n.expense_id}`); else if (n.group_id) navigate(`/group/${n.group_id}`) }}
                    className={`tap w-full flex items-start gap-3 px-4 py-3.5 text-left ${n.read_at ? '' : 'bg-pink/5'}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar user={n.actor || { name: '?' }} size={42} />
                      <span className={`absolute -right-1 -bottom-1 w-6 h-6 rounded-full grid place-items-center ring-2 ring-white ${n.kind === 'settlement' ? 'bg-green text-white' : n.kind === 'edit' ? 'bg-purple text-white' : 'bg-ink text-white'}`}>
                        <Icon name={n.kind === 'settlement' ? 'handshake' : n.kind === 'edit' ? 'edit' : 'receipt'} size={12} />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] leading-snug ${n.read_at ? 'font-semibold' : 'font-bold'}`}>{n.title}</p>
                      <p className="text-[13px] font-semibold text-ink-soft mt-0.5">{n.body}</p>
                      {n.share > 0 && n.kind !== 'settlement' && (
                        <span className="inline-flex mt-1.5 h-6 px-2.5 rounded-full bg-lilac text-purple text-[12px] font-bold items-center">Your share: {money(n.share, n.body.match(/^[A-Z]{3}\b/)?.[0] || 'PHP', { decimals: true })}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[11px] font-bold text-ink-faint">{timeAgo(n.created_at)}</span>
                      {!n.read_at && <span className="w-2.5 h-2.5 rounded-full bg-pink" aria-label="Unread" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </Screen>
  )
}
