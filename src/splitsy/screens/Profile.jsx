import { useState } from 'react'
import { Screen, TopBar, Button, Mascot, useToast } from '../components/ui'
import AvatarPicker from '../components/AvatarPicker'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'

export default function Profile() {
  const { user, setUser, isAdmin } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const [newAvatar, setNewAvatar] = useState(null)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone

  const update = async (patch) => {
    setBusy(true)
    try {
      setUser(await api.updateProfile(patch))
      toast('Profile updated!')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="pb-10">
      <TopBar title="Profile" />
      <section className="px-5 pt-4 flex flex-col items-center">
        <AvatarPicker value={newAvatar} user={user} busy={busy && !!newAvatar} onChange={(f) => { setNewAvatar(f); update({ avatarFile: f }) }} />
        <p className="font-display font-bold text-[24px] mt-4">{user.name}</p>
        <p className="text-ink-soft font-semibold text-[14px]">{user.email}</p>
      </section>

      <section className="px-5 mt-7 flex flex-col gap-3">
        <label className="font-bold text-[14px] text-ink-soft">Display name</label>
        <div className="flex gap-2">
          <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="lg" className="w-28" disabled={!name.trim() || name === user.name} loading={busy} onClick={() => update({ name: name.trim() })}>Save</Button>
        </div>
      </section>

      {isAdmin && (
        <section className="px-5 mt-6">
          <button onClick={() => navigate('/admin')} className="tap w-full rounded-[28px] bg-ink text-white p-4 flex items-center gap-3 text-left shadow-ink">
            <span className="w-12 h-12 rounded-2xl grad-btn grid place-items-center shrink-0"><Icon name="crown" size={22} /></span>
            <span className="flex-1">
              <span className="block font-display font-bold text-[17px]">Superadmin dashboard</span>
              <span className="block text-[13px] text-white/70 font-semibold">Users, groups, transactions & stats</span>
            </span>
            <Icon name="chevron" />
          </button>
        </section>
      )}

      {!standalone && (
        <section className="px-5 mt-6">
          <div className="card p-4 flex items-center gap-3">
            <img src="/apps/splitsy/icon-192.png" alt="" className="w-14 h-14 rounded-2xl" />
            <div className="flex-1">
              <p className="font-bold text-[15px]">Add Splitsy to your home screen</p>
              <p className="text-[13px] text-ink-soft font-medium">iPhone: tap Share → “Add to Home Screen”. Android: menu ⋮ → “Install app”.</p>
            </div>
          </div>
        </section>
      )}

      <section className="px-5 mt-6">
        <div className="card p-4 flex items-center gap-3">
          <Mascot name="flower" size={52} anim="wiggle" />
          <p className="flex-1 text-[13px] font-semibold text-ink-soft">
            {api.mode === 'demo' ? 'Demo mode: everything is saved on this phone only. Connect Supabase to share groups with friends.' : 'Synced to the cloud — your friends see updates live'}
          </p>
        </div>
      </section>

      <section className="px-5 mt-6">
        <button onClick={() => navigate('/change-password')} className="tap w-full card p-4 flex items-center gap-3 text-left">
          <span className="w-10 h-10 rounded-2xl bg-lilac text-purple grid place-items-center shrink-0"><Icon name="lock" size={19} /></span>
          <span className="flex-1 font-bold text-[15px]">Change password</span>
          <Icon name="chevron" className="text-ink-faint" />
        </button>
      </section>

      <section className="px-5 mt-8">
        <Button variant="soft" className="w-full" onClick={async () => { await api.signOut(); setUser(null); navigate('/', { replace: true }) }}>
          <Icon name="logout" size={19} /> Sign out
        </Button>
      </section>
    </Screen>
  )
}
