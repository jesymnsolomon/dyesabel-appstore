import { supabase } from './supabase'
import { compressImage, compressAvatar, isCompressed } from './image'
import { inviteCode, transactionRef, uuid } from './id'

const T = { profiles: 'splitsy_profiles', groups: 'splitsy_groups', members: 'splitsy_members', expenses: 'splitsy_expenses' }

function check({ data, error }) {
  if (error) throw new Error(error.message)
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
      await supabase.from(T.groups).select('*, members:splitsy_members(user_id, profile:splitsy_profiles(id,name,avatar_url))').order('created_at', { ascending: false }),
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
      await supabase.from(T.members).select('joined_at, profile:splitsy_profiles(id,name,avatar_url)').eq('group_id', id).order('joined_at'),
    )
    return { ...group, members: rows.map((r) => r.profile).filter(Boolean) }
  },
  async previewInvite(code) {
    const rows = check(await supabase.rpc('splitsy_invite_preview', { code }))
    return rows?.[0] || null
  },
  async joinGroup(code) {
    return check(await supabase.rpc('splitsy_join', { code }))
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
    return check(await supabase.from(T.expenses).insert(row).select().single())
  },
  async addPhotos(expense, files) {
    const photos = [...(expense.photos || [])]
    for (const f of files) photos.push(await uploadPhoto(f))
    return check(await supabase.from(T.expenses).update({ photos }).eq('id', expense.id).select().single())
  },
  async deleteExpense(id) {
    check(await supabase.from(T.expenses).delete().eq('id', id))
  },

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
    const [users, groups, members, expenses] = await Promise.all([
      supabase.rpc('splitsy_admin_users').then(check),
      fetchAll(T.groups, '*'),
      fetchAll(T.members, 'group_id, user_id, joined_at', 'joined_at'),
      fetchAll(T.expenses, 'id, ref, group_id, kind, title, category, amount, paid_by, created_by, payment_method, channel, place_name, original_currency, original_amount, items, photos, created_at'),
    ])
    return { users, groups, members, expenses }
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
