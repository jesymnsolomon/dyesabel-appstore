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

/**
 * Split a receipt by item.
 * - Normal items are divided equally between the people who had them.
 * - Shared lines (service charge, delivery fee, discounts) are spread in
 *   proportion to what each person ordered, so it stays fair.
 * Always adds up to the exact total.
 */
export function itemSplits(items, everyone) {
  const owed = {}
  const add = (id, c) => (owed[id] = (owed[id] || 0) + c)
  const spread = (cents, ids, weights) => {
    let given = 0
    ids.forEach((id, k) => {
      const part = k === ids.length - 1 ? cents - given : Math.round(cents * weights[k])
      given += part
      add(id, part)
    })
  }

  for (const it of items.filter((i) => !i.shared)) {
    const ids = it.people?.length ? it.people : everyone
    spread(toCents(it.price), ids, ids.map(() => 1 / ids.length))
  }

  const base = { ...owed }
  const subtotal = Object.values(base).reduce((a, b) => a + b, 0)
  for (const it of items.filter((i) => i.shared)) {
    const ids = subtotal > 0 ? Object.keys(base).filter((id) => base[id] > 0) : everyone
    const weights = ids.map((id) => (subtotal > 0 ? base[id] / subtotal : 1 / ids.length))
    spread(toCents(it.price), ids, weights)
  }

  return Object.entries(owed)
    .filter(([, c]) => c !== 0)
    .map(([user_id, c]) => ({ user_id, amount: fromCents(c) }))
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
    settlementsCount: expenses.length - real.length,
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

/** Scale everyone's share to a new total, keeping the same proportions (exact to the centavo). */
export function rescaleSplits(splits, newTotal) {
  const list = (splits || []).filter((s) => Number(s.amount) !== 0)
  const target = toCents(newTotal)
  const old = list.reduce((t, s) => t + toCents(s.amount), 0)
  if (!list.length) return []
  if (!old) return equalSplit(newTotal, list.map((s) => s.user_id))
  let given = 0
  return list.map((s, k) => {
    const c = k === list.length - 1 ? target - given : Math.round((toCents(s.amount) * target) / old)
    given += c
    return { user_id: s.user_id, amount: fromCents(c) }
  })
}

/**
 * New shares after a transaction is edited, keeping how it was split:
 * - "items" (receipt split by item): re-run the per-item split
 * - "equal": split equally between the same people
 * - anything else (custom, fixed + rest, settle-ups): same proportions as before
 * `rate` converts item prices (receipt currency) into the group currency.
 */
export function recomputeSplits(expense, { amount, items }, memberIds, rate = 1) {
  if (expense.split_mode === 'items' && items?.some((i) => i.people?.length || i.shared)) {
    const inOriginal = itemSplits(items.map((i) => ({ ...i, price: Number(i.price) })), memberIds)
    return rate === 1 ? inOriginal : rescaleSplits(inOriginal, amount)
  }
  if (expense.split_mode === 'equal') return equalSplit(amount, (expense.splits || []).map((s) => s.user_id))
  return rescaleSplits(expense.splits, amount)
}

/**
 * Why `from` owes `to`: every bill (and settle-up) between just these two people.
 * Each line is in cents: positive = adds to what `from` owes `to`, negative = takes it away.
 * `direct` is the total of those lines. The "who owes who" amount can differ from it,
 * because debts are combined across the whole group so fewer payments are needed.
 */
export function pairBreakdown(expenses, from, to) {
  const lines = []
  for (const e of expenses) {
    const share = (id) => toCents((e.splits || []).find((s) => s.user_id === id)?.amount || 0)
    let c = 0
    if (e.paid_by === to) c += share(from)
    if (e.paid_by === from) c -= share(to)
    if (c !== 0) lines.push({ expense: e, cents: c })
  }
  lines.sort((a, b) => b.expense.created_at.localeCompare(a.expense.created_at))
  return { lines, direct: lines.reduce((t, l) => t + l.cents, 0) }
}
