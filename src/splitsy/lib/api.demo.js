/**
 * Demo mode: same API as the cloud version, but everything is stored on this
 * device (IndexedDB). Used automatically when no Supabase keys are set, so the
 * app can be tried instantly. Invite links only work on the same device here.
 */
import { compressImage, compressAvatar, isCompressed, blobToDataURL } from './image'
import { inviteCode, transactionRef, uuid } from './id'

const DB_NAME = 'splitsy-demo'
const KEY = 'db'
const SESSION = 'splitsy-demo-session'

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function load() {
  const db = await idb()
  return new Promise((res) => {
    const q = db.transaction('kv').objectStore('kv').get(KEY)
    q.onsuccess = () => res(q.result || { users: [], groups: [], members: [], expenses: [] })
    q.onerror = () => res({ users: [], groups: [], members: [], expenses: [] })
  })
}
async function save(data) {
  const db = await idb()
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(data, KEY)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}

async function hash(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const listeners = new Set()
const emit = (user) => listeners.forEach((cb) => cb(user))
const groupListeners = new Map()
const noteListeners = new Set()

// Same as the database trigger in schema.sql: one notification per other member
function addNotifications(db, e) {
  const actor = db.users.find((u) => u.id === e.created_by)
  const g = db.groups.find((x) => x.id === e.group_id)
  if (!g) return
  const amt = `${g.currency} ${Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  db.notifications = db.notifications || []
  for (const m of db.members.filter((x) => x.group_id === e.group_id && x.user_id !== e.created_by)) {
    const share = (e.splits || []).filter((s) => s.user_id === m.user_id).reduce((t, s) => t + Number(s.amount), 0)
    const n = {
      id: uuid(), user_id: m.user_id, actor_id: e.created_by, group_id: e.group_id, expense_id: e.id, kind: e.kind || 'expense',
      title: e.kind === 'settlement' ? `${actor?.name || 'Someone'} settled up in ${g.name}` : `${actor?.name || 'Someone'} added ${e.title}`,
      body: e.kind === 'settlement' ? `${e.title} · ${amt}` : `${amt} in ${g.name}`,
      share: share || null, read_at: null, created_at: new Date().toISOString(),
    }
    db.notifications.push(n)
    setTimeout(() => noteListeners.forEach((cb) => cb(n)), 0)
  }
}
const ping = (gid) => groupListeners.get(gid)?.forEach((cb) => cb())

const me = () => localStorage.getItem(SESSION)
const ADMIN_EMAILS = (import.meta.env?.VITE_SPLITSY_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
function isAdminIn(db, id) {
  const u = db.users.find((x) => x.id === id)
  if (!u || (db.removedAdmins || []).includes(id)) return false
  return db.users[0]?.id === id || (db.admins || []).includes(id) || ADMIN_EMAILS.includes(u.email)
}
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url }
const photo = async (file, size = 1000) => blobToDataURL(isCompressed(file) ? file : await compressImage(file, size, 0.75))
const avatarPhoto = async (file) => blobToDataURL(isCompressed(file) ? file : await compressAvatar(file, 400, 0.8))
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function requireMe() {
  const id = me()
  if (!id) throw new Error('Please sign in again')
  return id
}

export const demoApi = {
  mode: 'demo',

  async getUser() {
    const db = await load()
    return publicUser(db.users.find((u) => u.id === me()))
  },
  onAuthChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  async signUp({ name, email, password, avatarFile }) {
    await wait()
    const db = await load()
    const e = email.trim().toLowerCase()
    if (db.users.some((u) => u.email === e)) throw new Error('That email already has an account — try signing in.')
    const u = { id: uuid(), created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(), name, email: e, pass: await hash(password), avatar_url: avatarFile ? await avatarPhoto(avatarFile) : null }
    db.users.push(u)
    await save(db)
    localStorage.setItem(SESSION, u.id)
    emit(publicUser(u))
    return publicUser(u)
  },
  async signIn({ email, password }) {
    await wait()
    const db = await load()
    const u = db.users.find((x) => x.email === email.trim().toLowerCase())
    if (!u || u.pass !== (await hash(password))) throw new Error('Wrong email or password')
    u.last_sign_in_at = new Date().toISOString()
    await save(db)
    localStorage.setItem(SESSION, u.id)
    emit(publicUser(u))
    return publicUser(u)
  },
  // Demo mode can't send emails, so the reset happens right here on this phone.
  async requestPasswordReset(email) {
    await wait()
    const db = await load()
    if (!db.users.some((u) => u.email === email.trim().toLowerCase())) throw new Error('No account with that email on this phone')
    return { emailed: false }
  },
  async resetPasswordDirect(email, password) {
    const db = await load()
    const u = db.users.find((x) => x.email === email.trim().toLowerCase())
    if (!u) throw new Error('No account with that email on this phone')
    u.pass = await hash(password)
    u.last_sign_in_at = new Date().toISOString()
    await save(db)
    localStorage.setItem(SESSION, u.id)
    emit(publicUser(u))
    return publicUser(u)
  },
  async updatePassword(password) {
    const db = await load()
    const u = db.users.find((x) => x.id === requireMe())
    u.pass = await hash(password)
    await save(db)
    return publicUser(u)
  },
  async signOut() {
    localStorage.removeItem(SESSION)
    emit(null)
  },
  async updateProfile({ name, avatarFile }) {
    const db = await load()
    const u = db.users.find((x) => x.id === requireMe())
    if (name) u.name = name
    if (avatarFile) u.avatar_url = await avatarPhoto(avatarFile)
    await save(db)
    emit(publicUser(u))
    return publicUser(u)
  },

  async listGroups() {
    const db = await load()
    const id = requireMe()
    const mine = db.members.filter((m) => m.user_id === id).map((m) => m.group_id)
    return db.groups
      .filter((g) => mine.includes(g.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((g) => ({
        ...g,
        members: db.members.filter((m) => m.group_id === g.id).map((m) => publicUser(db.users.find((u) => u.id === m.user_id))).filter(Boolean),
        total: db.expenses.filter((e) => e.group_id === g.id && e.kind === 'expense').reduce((s, e) => s + Number(e.amount), 0),
      }))
  },
  async createGroup({ name, mascot, currency }) {
    const db = await load()
    const id = requireMe()
    const g = { id: uuid(), name, mascot, currency, invite_code: inviteCode(), created_by: id, created_at: new Date().toISOString() }
    db.groups.push(g)
    db.members.push({ group_id: g.id, user_id: id, joined_at: g.created_at })
    await save(db)
    return g
  },
  async getGroup(gid) {
    const db = await load()
    const g = db.groups.find((x) => x.id === gid)
    if (!g) throw new Error('Group not found')
    const members = db.members.filter((m) => m.group_id === gid).map((m) => publicUser(db.users.find((u) => u.id === m.user_id))).filter(Boolean)
    return { ...g, members }
  },
  async previewInvite(code) {
    const db = await load()
    const g = db.groups.find((x) => x.invite_code === code.toUpperCase())
    if (!g) return null
    const members = db.members.filter((m) => m.group_id === g.id)
    return { id: g.id, name: g.name, mascot: g.mascot, member_count: members.length, is_member: members.some((m) => m.user_id === me()) }
  },
  async joinGroup(code) {
    const db = await load()
    const id = requireMe()
    const g = db.groups.find((x) => x.invite_code === code.toUpperCase())
    if (!g) throw new Error('That invite link is not valid')
    if (!db.members.some((m) => m.group_id === g.id && m.user_id === id)) {
      db.members.push({ group_id: g.id, user_id: id, joined_at: new Date().toISOString() })
      await save(db)
      ping(g.id)
    }
    return g.id
  },
  async deleteGroup(gid) {
    const db = await load()
    const g = db.groups.find((x) => x.id === gid)
    if (!g) throw new Error('Group not found')
    if (g.created_by !== requireMe()) throw new Error('Only the person who created this group can delete it')
    db.groups = db.groups.filter((x) => x.id !== gid)
    db.members = db.members.filter((m) => m.group_id !== gid)
    const gone = new Set(db.expenses.filter((e) => e.group_id === gid).map((e) => e.id))
    db.expenses = db.expenses.filter((e) => e.group_id !== gid)
    db.notifications = (db.notifications || []).filter((n) => n.group_id !== gid && !gone.has(n.expense_id))
    await save(db)
  },
  async leaveGroup(gid) {
    const db = await load()
    const id = requireMe()
    db.members = db.members.filter((m) => !(m.group_id === gid && m.user_id === id))
    await save(db)
  },

  async listExpenses(gid) {
    const db = await load()
    return db.expenses.filter((e) => e.group_id === gid).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async getExpense(id) {
    const db = await load()
    const e = db.expenses.find((x) => x.id === id)
    if (!e) throw new Error('Transaction not found')
    return e
  },
  async createExpense(payload, files = []) {
    const photos = []
    for (const f of files) photos.push(await photo(f))
    const db = await load()
    const e = { kind: 'expense', ...payload, id: uuid(), ref: transactionRef(), photos, created_by: requireMe(), created_at: new Date().toISOString() }
    db.expenses.push(e)
    addNotifications(db, e)
    await save(db)
    ping(e.group_id)
    return e
  },
  async addPhotos(expense, files) {
    const extra = []
    for (const f of files) extra.push(await photo(f))
    const db = await load()
    const e = db.expenses.find((x) => x.id === expense.id)
    e.photos = [...(e.photos || []), ...extra]
    await save(db)
    return e
  },
  async deleteExpense(id) {
    const db = await load()
    const e = db.expenses.find((x) => x.id === id)
    db.expenses = db.expenses.filter((x) => x.id !== id)
    await save(db)
    if (e) ping(e.group_id)
  },
  // ---------- notifications (demo: kept on this device) ----------
  async listNotifications() {
    const db = await load()
    const id = requireMe()
    return (db.notifications || [])
      .filter((n) => n.user_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 80)
      .map((n) => ({ ...n, actor: publicUser(db.users.find((u) => u.id === n.actor_id)) }))
  },
  async markNotificationsRead(ids) {
    const db = await load()
    const id = requireMe()
    const now = new Date().toISOString()
    for (const n of db.notifications || []) if (n.user_id === id && !n.read_at && (!ids?.length || ids.includes(n.id))) n.read_at = now
    await save(db)
  },
  subscribeNotifications(userId, cb) {
    const fn = (n) => n.user_id === userId && cb(n)
    noteListeners.add(fn)
    return () => noteListeners.delete(fn)
  },
  async savePushSubscription() {},
  async deletePushSubscription() {},
  sendPush() {},
  pushAvailable: false,

  // ---------- superadmin (demo: the first account on this device, or emails in VITE_SPLITSY_ADMIN_EMAILS) ----------
  async isAdmin() {
    const db = await load()
    return isAdminIn(db, me())
  },
  async adminData() {
    const db = await load()
    if (!isAdminIn(db, me())) throw new Error('Superadmins only')
    return {
      users: db.users.map((u) => ({ ...publicUser(u), created_at: u.created_at || null, last_sign_in_at: u.last_sign_in_at || null, is_admin: isAdminIn(db, u.id) })),
      groups: db.groups,
      members: db.members,
      expenses: db.expenses,
    }
  },
  async adminDeleteGroup(gid) {
    const db = await load()
    if (!isAdminIn(db, me())) throw new Error('Superadmins only')
    db.groups = db.groups.filter((g) => g.id !== gid)
    db.members = db.members.filter((m) => m.group_id !== gid)
    db.expenses = db.expenses.filter((e) => e.group_id !== gid)
    await save(db)
  },
  async adminDeleteExpense(id) {
    const db = await load()
    if (!isAdminIn(db, me())) throw new Error('Superadmins only')
    db.expenses = db.expenses.filter((e) => e.id !== id)
    await save(db)
  },
  async adminSetAdmin(userId, makeAdmin) {
    const db = await load()
    if (!isAdminIn(db, me())) throw new Error('Superadmins only')
    if (!makeAdmin && userId === me()) throw new Error('You can’t remove your own superadmin access')
    db.admins = (db.admins || []).filter((id) => id !== userId)
    db.removedAdmins = (db.removedAdmins || []).filter((id) => id !== userId)
    if (makeAdmin) db.admins.push(userId)
    else db.removedAdmins.push(userId)
    await save(db)
  },

  subscribe(gid, cb) {
    if (!groupListeners.has(gid)) groupListeners.set(gid, new Set())
    groupListeners.get(gid).add(cb)
    return () => groupListeners.get(gid)?.delete(cb)
  },
}
