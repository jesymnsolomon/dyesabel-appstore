import { useState } from 'react'
import { Screen, TopBar, Avatar, Button, PhotoInput, Mascot, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { navigate } from '../lib/router'

export default function Profile() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
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
        <PhotoInput facing="user" onPick={(f) => update({ avatarFile: f })} className="tap relative">
          <div className="p-1.5 rounded-full grad-warm shadow-pop"><Avatar user={user} size={128} ring /></div>
          <span className="absolute bottom-1 right-1 w-11 h-11 rounded-full bg-ink text-white grid place-items-center ring-4 ring-cream"><Icon name="camera" size={19} /></span>
        </PhotoInput>
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

      <section className="px-5 mt-8">
        <Button variant="soft" className="w-full" onClick={async () => { await api.signOut(); setUser(null); navigate('/', { replace: true }) }}>
          <Icon name="logout" size={19} /> Sign out
        </Button>
      </section>
    </Screen>
  )
}
