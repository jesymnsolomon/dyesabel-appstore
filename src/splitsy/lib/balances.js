import { toCents, fromCents } from './format'

/** Split a total equally (in cents) so the pieces always add up exactly. */
export function equalSplit(total, userIds) {
  const cents = toCents(total)
  const n = userIds.length
  if (!n) return []
  const base = Math.floor(cents / n)
  let rem = cents - base * n
  return userIds.map((user_id) => {
    const extra = rem > 0 ? 1 : 0
    rem -= extra
    return { user_id, amount: fromCents(base + extra) }
  })
}

/** Net balance per user, in cents. Positive = is owed money. Negative = owes. */
export function netBalances(expenses, memberIds) {
  const net = Object.fromEntries(memberIds.map((id) => [id, 0]))
  for (const e of expenses) {
    net[e.paid_by] = (net[e.paid_by] || 0) + toCents(e.amount)
    for (const s of e.splits || []) net[s.user_id] = (net[s.user_id] || 0) - toCents(s.amount)
  }
  return net
}

/** Turns balances into the fewest "A pays B" transfers. */
export function simplifyDebts(net) {
  const debtors = []
  const creditors = []
  for (const [id, c] of Object.entries(net)) {
    if (c < -0) debtors.push({ id, c: -c })
    else if (c > 0) creditors.push({ id, c })
  }
  debtors.sort((a, b) => b.c - a.c)
  creditors.sort((a, b) => b.c - a.c)
  const out = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].c, creditors[j].c)
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: fromCents(pay) })
    debtors[i].c -= pay
    creditors[j].c -= pay
    if (debtors[i].c === 0) i++
    if (creditors[j].c === 0) j++
  }
  return out
}

/** All the numbers the group dashboard needs. */
export function groupStats(expenses, memberIds, meId) {
  const real = expenses.filter((e) => e.kind !== 'settlement')
  const total = real.reduce((s, e) => s + toCents(e.amount), 0)
  const mySpend = real.reduce((s, e) => s + toCents(e.splits?.find((x) => x.user_id === meId)?.amount || 0), 0)
  const myPaid = real.filter((e) => e.paid_by === meId).reduce((s, e) => s + toCents(e.amount), 0)

  const byCategory = {}
  const byPayer = {}
  const byMethod = { cash: 0, card: 0 }
  const byChannel = { online: 0, in_person: 0 }
  for (const e of real) {
    const c = toCents(e.amount)
    byCategory[e.category] = (byCategory[e.category] || 0) + c
    byPayer[e.paid_by] = (byPayer[e.paid_by] || 0) + c
    byMethod[e.payment_method] = (byMethod[e.payment_method] || 0) + c
    byChannel[e.channel] = (byChannel[e.channel] || 0) + c
  }

  // last 14 days spending
  const days = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let k = 13; k >= 0; k--) {
    const d = new Date(today); d.setDate(today.getDate() - k)
    days.push({ date: d, cents: 0 })
  }
  for (const e of real) {
    const d = new Date(e.created_at); d.setHours(0, 0, 0, 0)
    const slot = days.find((x) => x.date.getTime() === d.getTime())
    if (slot) slot.cents += toCents(e.amount)
  }

  const net = netBalances(expenses, memberIds)
  const categories = Object.entries(byCategory).map(([name, c]) => ({ name, amount: fromCents(c), share: total ? c / total : 0 })).sort((a, b) => b.amount - a.amount)
  const topPayer = Object.entries(byPayer).sort((a, b) => b[1] - a[1])[0]

  return {
    total: fromCents(total),
    count: real.length,
    average: real.length ? fromCents(total / real.length) : 0,
    mySpend: fromCents(mySpend),
    myPaid: fromCents(myPaid),
    myNet: fromCents(net[meId] || 0),
    categories,
    topPayer: topPayer ? { id: topPayer[0], amount: fromCents(topPayer[1]) } : null,
    byMethod: { cash: fromCents(byMethod.cash), card: fromCents(byMethod.card) },
    byChannel: { online: fromCents(byChannel.online), in_person: fromCents(byChannel.in_person) },
    days: days.map((d) => ({ date: d.date, amount: fromCents(d.cents) })),
    net: Object.fromEntries(Object.entries(net).map(([k, v]) => [k, fromCents(v)])),
    debts: simplifyDebts(net),
  }
}
