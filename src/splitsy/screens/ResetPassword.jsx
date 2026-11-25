import { useEffect, useState } from 'react'
import { Screen, TopBar, Assistant, Button, Mascot, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth } from '../auth'
import { firstName } from '../lib/format'
import { NewPasswordForm } from './ForgotPassword'

/** Clean the reset link (?reset=1 and any tokens) out of the address bar. */
export function leaveResetMode(to = '/') {
  window.history.replaceState(null, '', `/splitsy/#${to}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Opened from the email link. Supabase signs the user in from the link, then they pick a new password. */
export default function ResetPassword() {
  const { user, ready, setUser } = useAuth()
  const [waited, setWaited] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  // The link's session can take a moment to arrive; after that, assume it expired.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000)
    return () => clearTimeout(t)
  }, [])

  const save = async (pw) => {
    setBusy(true)
    try {
      const u = await api.updatePassword(pw)
      if (u) setUser(u)
      toast(`Password updated. Welcome back${u?.name ? `, ${firstName(u.name)}` : ''}!`)
      leaveResetMode('/')
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  if (!user && (!ready || !waited)) {
    return (
      <div className="min-h-[100dvh] grid place-items-center text-center px-6">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={30} />
          <p className="font-bold text-ink-soft">Opening your reset link…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Screen className="flex flex-col items-center justify-center px-6 text-center">
        <Mascot name="cloudpink" size={140} />
        <h1 className="font-display font-extrabold text-[26px] mt-5">This link has expired</h1>
        <p className="text-ink-soft font-medium mt-2">Reset links work once and only for a little while. Ask for a new one and use it right away.</p>
        <div className="flex flex-col gap-2 w-full mt-8">
          <Button onClick={() => leaveResetMode('/forgot')}>Send a new link</Button>
          <Button variant="ghost" size="md" onClick={() => leaveResetMode('/signin')}>Back to sign in</Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen className="flex flex-col">
      <div className="px-5 pt-10 safe-top flex-1 flex flex-col gap-6">
        <Assistant mascot="heart" sub={user.email ? `For ${user.email}` : undefined}>Almost there! Pick a new password</Assistant>
        <div className="animate-rise"><NewPasswordForm busy={busy} onSubmit={save} /></div>
      </div>
    </Screen>
  )
}

/** Signed-in users changing their password from Profile. */
export function ChangePassword() {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const save = async (pw) => {
    setBusy(true)
    try {
      await api.updatePassword(pw)
      toast('Password updated!')
      navigate('/profile', { replace: true })
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }
  return (
    <Screen className="flex flex-col">
      <TopBar title="Change password" fallback="/profile" />
      <div className="px-5 pt-4 flex-1 flex flex-col gap-6">
        <Assistant mascot="heart" sub="You’ll use it next time you sign in.">Let’s set a new password</Assistant>
        <div className="animate-rise"><NewPasswordForm busy={busy} onSubmit={save} /></div>
      </div>
    </Screen>
  )
}
