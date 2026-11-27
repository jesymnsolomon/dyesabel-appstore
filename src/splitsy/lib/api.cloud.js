import { supabase } from './supabase'
import { compressImage, compressAvatar, isCompressed } from './image'
import { inviteCode, transactionRef, uuid } from './id'

const T = { profiles: 'splitsy_profiles', groups: 'splitsy_groups', members: 'splitsy_members', expenses: 'splitsy_expenses' }

// Profile fields we read. If the database hasn't been updated with the latest
// schema.sql yet (no is_placeholder column), fall back to the older field list.
let PROFILE_FIELDS = 'id,name,avatar_url,is_placeholder'
const missingColumn = (error) => error && (error.code === '42703' || /is_placeholder/.test(error.message || ''))
async function withProfiles(run) {
  let res = await run(PROFILE_FIELDS)
  if (missingColumn(res.error) && PROFILE_FIELDS.includes('is_placeholder')) {
    PROFILE_FIELDS = 'id,name,avatar_url'
    console.warn('Splitsy: run the latest supabase/schema.sql to enable placeholder members')
    res = await run(PROFILE_FIELDS)
  }
  return res
}

function check({ data, error }) {
  if (error) {
    // A database function the app needs isn't there yet (schema.sql not re-run)
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
      throw new Error('This needs the latest Splitsy database update. Run supabase/schema.sql in Supabase, then try again.')
    }
    throw new Error(error.message)
  }
  return data
}

async function uid() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Please sign in again')
  return id
}

async function uploadPhoto(file, folder = 'photos') {
  const me = await uid()
  const blob = isCompressed(file) ? file : folder === 'avatars' ? await compressAvatar(file) : await compressImage(file, 1280)
  const path = `${me}/${folder}/${uuid()}.jpg`
  check(await supabase.storage.from('splitsy').upload(path, blob, { contentType: 'image/jpeg', upsert: false }))
  return supabase.storage.from('splitsy').getPublicUrl(path).data.publicUrl
}

async function loadProfile(user) {
  if (!user) return null
  let { data } = await supabase.from(T.profiles).select('*').eq('id', user.id).maybeSingle()
  if (!data) {
    data = check(
      await supabase.from(T.profiles).upsert({ id: user.id, name: user.user_metadata?.name || 'Friend' }).select().single(),
    )
  }
  return { ...data, email: user.email }
}

export const cloudApi = {
  mode: 'cloud',

  // ---------- auth ----------
  async getUser() {
    const { data } = await supabase.auth.getSession()
    return loadProfile(data.session?.user)
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      // defer to avoid calling supabase inside the auth callback
      setTimeout(async () => cb(await loadProfile(session?.user).catch(() => null)), 0)
    })
    return () => data.subscription.unsubscribe()
  },
  async signUp({ name, email, password, avatarFile }) {
    const res = check(await supabase.auth.signUp({ email, password, options: { data: { name } } }))
    if (!res.session) {
      throw new Error('Check your email to confirm your account, then sign in. (Tip: turn off "Confirm email" in Supabase → Auth for instant sign-ups.)')
    }
    if (avatarFile) {
      const avatar_url = await uploadPhoto(avatarFile, 'avatars')
      check(await supabase.from(T.profiles).update({ avatar_url, name }).eq('id', res.user.id))
    }
    return loadProfile(res.user)
  },
  async signIn({ email, password }) {
    const res = check(await supabase.auth.signInWithPassword({ email, password }))
    return loadProfile(res.user)
  },
  /** Emails a reset link. Supabase doesn't reveal whether the email exists. */
  async requestPasswordReset(email) {
    const redirectTo = `${window.location.origin}/splitsy/?reset=1`
    check(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }))
    return { emailed: true }
  },
  /** Used on the "Set a new password" screen after opening the email link. */
  async updatePassword(password) {
    check(await supabase.auth.updateUser({ password }))
    const { data } = await supabase.auth.getSession()
    return loadProfile(data.session?.user)
  },
  async signOut() {
    await supabase.auth.signOut()
  },
  async updateProfile({ name, avatarFile }) {
    const me = await uid()
    const patch = {}
    if (name) patch.name = name
    if (avatarFile) patch.avatar_url = await uploadPhoto(avatarFile, 'avatars')
    check(await supabase.from(T.profiles).update(patch).eq('id', me))
    const { data } = await supabase.auth.getSession()
    return loadProfile(data.session.user)
  },

  // ---------- groups ----------
  async listGroups() {
    const groups = check(
      await withProfiles((f) => supabase.from(T.groups).select(`*, members:splitsy_members(user_id, profile:splitsy_profiles(${f}))`).order('created_at', { ascending: false })),
    )
    if (!groups.length) return []
    const totals = check(
      await supabase.from(T.expenses).select('group_id, amount, kind').in('group_id', groups.map((g) => g.id)).eq('kind', 'expense'),
    )
    return groups.map((g) => ({
      ...g,
      members: g.members.map((m) => m.profile).filter(Boolean),
      total: totals.filter((t) => t.group_id === g.id).reduce((s, t) => s + Number(t.amount), 0),
    }))
  },
  async createGroup({ name, mascot, currency }) {
    const me = await uid()
    return check(
      await supabase.from(T.groups).insert({ name, mascot, currency, invite_code: inviteCode(), created_by: me }).select().single(),
    )
  },
  async getGroup(id) {
    const group = check(await supabase.from(T.groups).select('*').eq('id', id).single())
    const rows = check(
      await withProfiles((f) => supabase.from(T.members).select(`joined_at, profile:splitsy_profiles(${f})`).eq('group_id', id).order('joined_at')),
    )
    return { ...group, members: rows.map((r) => r.profile).filter(Boolean) }
  },
  async previewInvite(code) {
    const rows = check(await supabase.rpc('splitsy_invite_preview', { code }))
    return rows?.[0] || null
  },
  async joinGroup(code, claim = null) {
    // only send `claim` when picking a placeholder, so joining still works on an older database
    return check(await supabase.rpc('splitsy_join', claim ? { code, claim } : { code }))
  },
  /** Host only: add someone who isn't on Splitsy yet. */
  async addPlaceholder(groupId, name) {
    return check(await supabase.rpc('splitsy_add_placeholder', { gid: groupId, pname: name }))
  },
  async removePlaceholder(groupId, placeholderId) {
    check(await supabase.rpc('splitsy_remove_placeholder', { gid: groupId, pid: placeholderId }))
  },
  /** Host only: someone joined as new; move the placeholder's bills to their real account. */
  async mergePlaceholder(groupId, placeholderId, memberId) {
    check(await supabase.rpc('splitsy_merge_placeholder', { gid: groupId, pid: placeholderId, target: memberId }))
  },
  /** Only the group's creator can do this (enforced by the database). */
  async deleteGroup(groupId) {
    const me = await uid()
    const { data, error } = await supabase.from(T.groups).delete().eq('id', groupId).eq('created_by', me).select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('Only the person who created this group can delete it')
  },
  async leaveGroup(groupId) {
    const me = await uid()
    check(await supabase.from(T.members).delete().eq('group_id', groupId).eq('user_id', me))
  },

  // ---------- expenses ----------
  async listExpenses(groupId) {
    return check(await supabase.from(T.expenses).select('*').eq('group_id', groupId).order('created_at', { ascending: false }))
  },
  async getExpense(id) {
    return check(await supabase.from(T.expenses).select('*').eq('id', id).single())
  },
  async createExpense(payload, files = []) {
    const me = await uid()
    const photos = []
    for (const f of files) photos.push(await uploadPhoto(f))
    const row = { ...payload, photos, ref: transactionRef(), created_by: me }
    const saved = check(await supabase.from(T.expenses).insert(row).select().single())
    cloudApi.sendPush(saved.id) // phone notifications for the rest of the group (best effort)
    return saved
  },
  async updateExpense(id, patch) {
    return check(await supabase.from(T.expenses).update(patch).eq('id', id).select().single())
  },
  async addPhotos(expense, files) {
    const photos = [...(expense.photos || [])]
    for (const f of files) photos.push(await uploadPhoto(f))
    return check(await supabase.from(T.expenses).update({ photos }).eq('id', expense.id).select().single())
  },
  async deleteExpense(id) {
    check(await supabase.from(T.expenses).delete().eq('id', id))
  },

  // ---------- notifications ----------
  async listNotifications() {
    const me = await uid()
    return check(
      await supabase
        .from('splitsy_notifications')
        .select('*, actor:splitsy_profiles!splitsy_notifications_actor_id_fkey(id,name,avatar_url)')
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(80),
    )
  },
  async markNotificationsRead(ids) {
    const me = await uid()
    let q = supabase.from('splitsy_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me).is('read_at', null)
    if (ids?.length) q = q.in('id', ids)
    check(await q)
  },
  /** Calls cb(notification) whenever a new one arrives for me. */
  subscribeNotifications(userId, cb) {
    const ch = supabase
      .channel(`splitsy-notes-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'splitsy_notifications', filter: `user_id=eq.${userId}` }, (p) => cb(p.new))
      .subscribe()
    return () => supabase.removeChannel(ch)
  },
  async savePushSubscription(sub) {
    const me = await uid()
    const j = sub.toJSON ? sub.toJSON() : sub
    check(await supabase.from('splitsy_push_subscriptions').upsert({ endpoint: j.endpoint, user_id: me, p256dh: j.keys.p256dh, auth: j.keys.auth }))
  },
  async deletePushSubscription(endpoint) {
    check(await supabase.from('splitsy_push_subscriptions').delete().eq('endpoint', endpoint))
  },
  sendPush(expenseId) {
    supabase.functions.invoke('splitsy-notify', { body: { expense_id: expenseId } }).catch(() => {})
  },
  pushAvailable: Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY),

  // ---------- superadmin ----------
  async isAdmin() {
    const { data, error } = await supabase.rpc('splitsy_is_admin')
    return !error && data === true
  },
  async adminData() {
    const fetchAll = async (table, columns, order = 'created_at') => {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const page = check(await supabase.from(table).select(columns).order(order, { ascending: false }).range(from, from + 999))
        rows.push(...page)
        if (page.length < 1000) break
      }
      return rows
    }
    const [users, placeholders, groups, members, expenses] = await Promise.all([
      supabase.rpc('splitsy_admin_users').then(check),
      // people added by hosts who haven't joined yet (not real accounts, so not in `users`)
      supabase.from(T.profiles).select('id,name,avatar_url,is_placeholder').eq('is_placeholder', true).then(({ data }) => data || []),
      fetchAll(T.groups, '*'),
      fetchAll(T.members, 'group_id, user_id, joined_at', 'joined_at'),
      fetchAll(T.expenses, 'id, ref, group_id, kind, title, category, amount, paid_by, created_by, payment_method, channel, place_name, original_currency, original_amount, items, photos, created_at'),
    ])
    return { users, placeholders, groups, members, expenses }
  },
  async adminDeleteGroup(id) {
    check(await supabase.from(T.groups).delete().eq('id', id))
  },
  async adminDeleteExpense(id) {
    check(await supabase.from(T.expenses).delete().eq('id', id))
  },
  async adminSetAdmin(userId, makeAdmin) {
    check(await supabase.rpc('splitsy_admin_set', { target: userId, make_admin: makeAdmin }))
  },

  /** Live updates: calls cb() whenever this group's expenses/members change. */
  subscribe(groupId, cb) {
    const ch = supabase
      .channel(`splitsy-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: T.expenses, filter: `group_id=eq.${groupId}` }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: T.members, filter: `group_id=eq.${groupId}` }, cb)
      .subscribe()
    return () => supabase.removeChannel(ch)
  },
}
