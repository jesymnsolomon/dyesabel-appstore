/**
 * Demo mode: same API as the cloud version, but everything is stored on this
 * device (IndexedDB). Used automatically when no Supabase keys are set, so the
 * app can be tried instantly. Invite links only work on the same device here.
 */
import { compressImage, blobToDataURL } from './image'
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
const ping = (gid) => groupListeners.get(gid)?.forEach((cb) => cb())

const me = () => localStorage.getItem(SESSION)
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url }
const photo = async (file, size = 1000) => blobToDataURL(await compressImage(file, size, 0.75))
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
    const u = { id: uuid(), name, email: e, pass: await hash(password), avatar_url: avatarFile ? await photo(avatarFile, 400) : null }
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
    localStorage.setItem(SESSION, u.id)
    emit(publicUser(u))
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
    if (avatarFile) u.avatar_url = await photo(avatarFile, 400)
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
  subscribe(gid, cb) {
    if (!groupListeners.has(gid)) groupListeners.set(gid, new Set())
    groupListeners.get(gid).add(cb)
    return () => groupListeners.get(gid)?.delete(cb)
  },
}
