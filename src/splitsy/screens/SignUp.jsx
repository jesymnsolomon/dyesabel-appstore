import { useState } from 'react'
import { Screen, TopBar, Assistant, Button, useToast } from '../components/ui'
import AvatarPicker from '../components/AvatarPicker'
import Icon from '../components/Icon'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth } from '../auth'
import { firstName } from '../lib/format'

export default function SignUp() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { setUser } = useAuth()

  const submit = async () => {
    setBusy(true)
    try {
      const u = await api.signUp({ name: name.trim(), email: email.trim(), password, avatarFile: avatar })
      setUser(u)
      toast(`Welcome to Splitsy, ${firstName(u.name)}!`)
      navigate('/', { replace: true })
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    {
      say: "Hi there! I'm Buddy What should I call you?",
      sub: 'Your friends will see this name.',
      body: (
        <input autoFocus className="field text-[20px] h-16" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(1)} />
      ),
      ok: name.trim().length > 0,
    },
    {
      say: `Nice to meet you, ${firstName(name)}! Add a profile photo`,
      sub: 'Take a selfie or upload a photo so friends know it’s you.',
      body: <div className="pt-2"><AvatarPicker value={avatar} onChange={setAvatar} /></div>,
      ok: true,
      skip: !avatar,
    },
    {
      say: 'Last thing! Let’s keep your account safe',
      sub: 'You’ll use these to sign in.',
      body: (
        <div className="flex flex-col gap-3">
          <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input className="field pr-14" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-ink-soft">
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </div>
      ),
      ok: /\S+@\S+\.\S+/.test(email) && password.length >= 6,
    },
  ]
  const s = steps[step]

  return (
    <Screen className="flex flex-col">
      <TopBar title="" onBack={() => (step ? setStep(step - 1) : navigate('/', { replace: true }))} right={<Dots n={3} i={step} />} />
      <div className="px-5 pt-4 flex-1 flex flex-col gap-6" key={step}>
        <Assistant mascot="buddy" sub={s.sub}>{s.say}</Assistant>
        <div className="animate-rise" style={{ animationDelay: '.08s' }}>{s.body}</div>
      </div>
      <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
        {step < 2 ? (
          <Button disabled={!s.ok} onClick={() => setStep(step + 1)}>
            {s.skip ? 'Skip for now' : 'Continue'} <Icon name="arrow" size={18} />
          </Button>
        ) : (
          <Button variant="grad" disabled={!s.ok} loading={busy} onClick={submit}>Create my account</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate('/signin', { replace: true })}>Already have an account? Sign in</Button>
      </div>
    </Screen>
  )
}

export function Dots({ n, i }) {
  return (
    <div className="flex gap-1.5 pr-1">
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={`h-2 rounded-full transition-all duration-300 ${k === i ? 'w-6 bg-ink' : k < i ? 'w-2 bg-ink/60' : 'w-2 bg-ink/15'}`} />
      ))}
    </div>
  )
}
