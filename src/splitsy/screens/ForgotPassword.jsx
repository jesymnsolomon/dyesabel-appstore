import { useEffect, useState } from 'react'
import { Screen, TopBar, Assistant, Button, Mascot, Spinner, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth } from '../auth'
import { firstName } from '../lib/format'

/** Password input with show / hide. */
export function PasswordField({ value, onChange, placeholder = 'Password', autoComplete = 'new-password', autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input autoFocus={autoFocus} className="field pr-14" type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-ink-soft" aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}

/** Shared "new password + confirm" block with simple checks. */
export function NewPasswordForm({ onSubmit, busy, cta = 'Save new password' }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const long = pw.length >= 6
  const match = pw && pw === pw2
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (long && match) onSubmit(pw) }} className="flex flex-col gap-3">
      <PasswordField autoFocus value={pw} onChange={setPw} placeholder="New password (6+ characters)" />
      <PasswordField value={pw2} onChange={setPw2} placeholder="Type it again" />
      <div className="flex flex-col gap-1 px-1 text-[13px] font-semibold">
        <span className={`flex items-center gap-1.5 ${long ? 'text-green' : 'text-ink-faint'}`}><Icon name="check" size={14} stroke={3} /> At least 6 characters</span>
        <span className={`flex items-center gap-1.5 ${match ? 'text-green' : 'text-ink-faint'}`}><Icon name="check" size={14} stroke={3} /> Both passwords match</span>
      </div>
      <Button type="submit" variant="grad" className="mt-3" disabled={!long || !match} loading={busy}>{cta}</Button>
    </form>
  )
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [demoReset, setDemoReset] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const toast = useToast()
  const { setUser } = useAuth()
  const valid = /\S+@\S+\.\S+/.test(email)

  useEffect(() => {
    if (!cooldown) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const r = await api.requestPasswordReset(email)
      if (r.emailed) {
        setSent(true)
        setCooldown(60)
      } else setDemoReset(true)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const resetHere = async (pw) => {
    setBusy(true)
    try {
      const u = await api.resetPasswordDirect(email, pw)
      setUser(u)
      toast(`Password updated. Welcome back, ${firstName(u.name)}!`)
      navigate('/', { replace: true })
    } catch (err) {
      toast(err.message, 'error')
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Screen className="flex flex-col">
        <TopBar title="" onBack={() => navigate('/signin', { replace: true })} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-40 h-40 rounded-full grad-warm grid place-items-center shadow-pop">
            <Mascot name="thumb" size={110} />
          </div>
          <h1 className="font-display font-extrabold text-[28px] mt-6">Check your inbox</h1>
          <p className="text-ink-soft font-medium mt-2">
            If <b className="text-ink">{email}</b> has a Splitsy account, we just sent a link to reset your password. It can take a minute, and check your spam folder too.
          </p>
          <div className="card w-full p-4 mt-6 text-left flex gap-3">
            <span className="w-10 h-10 rounded-2xl bg-lilac text-purple grid place-items-center shrink-0"><Icon name="info" size={20} /></span>
            <p className="text-[13px] font-semibold text-ink-soft">Open the email on this phone and tap the link. Splitsy will open so you can set a new password.</p>
          </div>
        </div>
        <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
          <Button onClick={() => navigate('/signin', { replace: true })}>Back to sign in</Button>
          <Button variant="ghost" size="md" disabled={cooldown > 0 || busy} onClick={send}>
            {busy ? <Spinner size={16} /> : cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
          </Button>
        </div>
      </Screen>
    )
  }

  if (demoReset) {
    return (
      <Screen className="flex flex-col">
        <TopBar title="" onBack={() => setDemoReset(false)} />
        <div className="px-5 pt-4 flex-1 flex flex-col gap-6">
          <Assistant mascot="heart" sub={`For ${email}. Demo mode can’t send emails, so you can reset it right here.`}>Let’s set a new password</Assistant>
          <div className="animate-rise"><NewPasswordForm busy={busy} onSubmit={resetHere} cta="Save & sign in" /></div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen className="flex flex-col">
      <TopBar title="" onBack={() => navigate('/signin', { replace: true })} />
      <form onSubmit={send} className="px-5 pt-4 flex-1 flex flex-col">
        <Assistant mascot="cloudpurple" sub="Type the email you signed up with and I’ll send you a reset link.">No worries, it happens!</Assistant>
        <input autoFocus className="field mt-8 animate-rise" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex-1" />
        <div className="pt-6 safe-bottom flex flex-col gap-2">
          <Button type="submit" variant="grad" disabled={!valid} loading={busy}>{api.mode === 'demo' ? 'Continue' : 'Send reset link'}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/signin', { replace: true })}>I remember it now</Button>
        </div>
      </form>
    </Screen>
  )
}
