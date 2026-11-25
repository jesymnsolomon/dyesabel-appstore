import { rateBetween } from './currency'

const DAY = 86400000
const dayKey = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

/**
 * Everything the superadmin dashboard shows, computed from raw rows.
 * Money is converted into `view` currency with today's rates (when available).
 */
export function adminStats({ users, groups, members, expenses }, view, rates) {
  const now = Date.now()
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]))
  const userById = Object.fromEntries(users.map((u) => [u.id, u]))
  const conv = (amount, groupId) => {
    const cur = groupById[groupId]?.currency || view
    if (cur === view) return Number(amount)
    const r = rateBetween(rates, cur, view)
    return r ? Number(amount) * r : null
  }

  const real = expenses.filter((e) => e.kind !== 'settlement')
  const settlements = expenses.filter((e) => e.kind === 'settlement')
  let volume = 0
  let unconverted = 0
  for (const e of real) {
    const v = conv(e.amount, e.group_id)
    if (v == null) unconverted++
    else volume += v
  }

  const since = (ms) => (x) => x && now - new Date(x).getTime() <= ms
  const active7 = new Set(real.filter((e) => since(7 * DAY)(e.created_at)).flatMap((e) => [e.created_by, e.paid_by]))

  // 30-day daily series
  const days = []
  const start = dayKey(now) - 29 * DAY
  for (let i = 0; i < 30; i++) days.push({ date: new Date(start + i * DAY), txns: 0, volume: 0, signups: 0 })
  const slot = (d) => days[Math.round((dayKey(d) - start) / DAY)]
  for (const e of real) {
    const s = slot(e.created_at)
    if (s) { s.txns++; s.volume += conv(e.amount, e.group_id) || 0 }
  }
  for (const u of users) {
    const s = u.created_at && slot(u.created_at)
    if (s) s.signups++
  }

  const sumBy = (rows, key) => {
    const out = {}
    for (const e of rows) {
      const k = typeof key === 'function' ? key(e) : e[key]
      out[k] = (out[k] || 0) + (conv(e.amount, e.group_id) || 0)
    }
    return out
  }
  const categories = Object.entries(sumBy(real, 'category')).map(([name, v]) => ({ name, value: v })).sort((a, b) => b.value - a.value)
  const method = sumBy(real, 'payment_method')
  const channel = sumBy(real, 'channel')

  // per-user + per-group rollups
  const membersByGroup = {}
  const groupsByUser = {}
  for (const m of members) {
    ;(membersByGroup[m.group_id] ||= []).push(m.user_id)
    ;(groupsByUser[m.user_id] ||= []).push(m.group_id)
  }
  const userRows = users.map((u) => {
    const mine = real.filter((e) => e.created_by === u.id)
    const paid = real.filter((e) => e.paid_by === u.id).reduce((s, e) => s + (conv(e.amount, e.group_id) || 0), 0)
    const lastTxn = mine.reduce((m, e) => (e.created_at > m ? e.created_at : m), '')
    return {
      ...u,
      groups: (groupsByUser[u.id] || []).length,
      txns: mine.length,
      paid,
      lastActive: [lastTxn, u.last_sign_in_at].filter(Boolean).sort().pop() || u.created_at,
    }
  })
  const groupRows = groups.map((g) => {
    const ex = real.filter((e) => e.group_id === g.id)
    const last = ex.reduce((m, e) => (e.created_at > m ? e.created_at : m), '')
    return {
      ...g,
      memberIds: membersByGroup[g.id] || [],
      members: (membersByGroup[g.id] || []).length,
      txns: ex.length,
      total: ex.reduce((s, e) => s + Number(e.amount), 0),
      totalView: ex.reduce((s, e) => s + (conv(e.amount, e.group_id) || 0), 0),
      owner: userById[g.created_by]?.name || '—',
      lastActivity: last || g.created_at,
    }
  })
  const currencies = {}
  for (const g of groups) currencies[g.currency] = (currencies[g.currency] || 0) + 1

  return {
    users: users.length,
    newUsers7: users.filter((u) => since(7 * DAY)(u.created_at)).length,
    newUsers30: users.filter((u) => since(30 * DAY)(u.created_at)).length,
    active7: active7.size,
    groups: groups.length,
    activeGroups7: new Set(real.filter((e) => since(7 * DAY)(e.created_at)).map((e) => e.group_id)).size,
    avgMembers: groups.length ? members.length / groups.length : 0,
    txns: real.length,
    txns7: real.filter((e) => since(7 * DAY)(e.created_at)).length,
    settlements: settlements.length,
    receipts: real.filter((e) => e.items?.length).length,
    foreign: real.filter((e) => e.original_currency).length,
    withPhotos: real.filter((e) => e.photos?.length).length,
    volume,
    unconverted,
    average: real.length ? volume / real.length : 0,
    days,
    categories,
    method: { cash: method.cash || 0, card: method.card || 0 },
    channel: { in_person: channel.in_person || 0, online: channel.online || 0 },
    currencies: Object.entries(currencies).sort((a, b) => b[1] - a[1]),
    userRows,
    groupRows,
    topGroups: [...groupRows].sort((a, b) => b.totalView - a.totalView).slice(0, 5),
    topSpenders: [...userRows].sort((a, b) => b.paid - a.paid).slice(0, 5),
    userById,
    groupById,
  }
}
