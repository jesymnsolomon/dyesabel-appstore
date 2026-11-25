import { useState } from 'react'
import { Screen, TopBar, Assistant, Button, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth } from '../auth'
import { firstName } from '../lib/format'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { setUser } = useAuth()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const u = await api.signIn({ email, password })
      setUser(u)
      toast(`Welcome back, ${firstName(u.name)}!`)
      navigate('/', { replace: true })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="flex flex-col">
      <TopBar title="" onBack={() => navigate('/', { replace: true })} />
      <form onSubmit={submit} className="px-5 pt-4 flex-1 flex flex-col">
        <Assistant mascot="heart" sub="Sign in to see your groups.">Welcome back! I missed you</Assistant>
        <div className="flex flex-col gap-3 mt-8 animate-rise">
          <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input className="field pr-14" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-ink-soft">
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </div>
        <div className="flex-1" />
        <div className="pt-6 safe-bottom flex flex-col gap-2">
          <Button type="submit" disabled={!email || !password} loading={busy}>Sign in</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/signup', { replace: true })}>New here? Create an account</Button>
        </div>
      </form>
    </Screen>
  )
}
