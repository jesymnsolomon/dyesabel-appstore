import { useEffect, useState } from 'react'
import { Screen, Mascot, Button, Spinner, Avatar, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth, setPendingJoin, setPendingClaim, getPendingClaim } from '../auth'
import { firstName } from '../lib/format'

export default function Join({ code }) {
  const { user } = useAuth()
  const [info, setInfo] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [claim, setClaim] = useState(() => getPendingClaim())
  const toast = useToast()

  useEffect(() => {
    api.previewInvite(code).then((i) => {
      setInfo(i)
      // forget a remembered choice if that person already joined
      if (i && claim && !(i.placeholders || []).some((p) => p.id === claim)) setClaim(null)
    }).catch(() => setInfo(null))
  }, [code, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const placeholders = info?.placeholders || []
  const chosen = placeholders.find((p) => p.id === claim)

  const join = async () => {
    if (!user) {
      setPendingJoin(code)
      setPendingClaim(claim)
      navigate('/signup')
      return
    }
    setBusy(true)
    try {
      const gid = await api.joinGroup(code, claim || null)
      setPendingClaim(null)
      toast(chosen ? `Welcome! ${firstName(chosen.name)}’s bills are now yours` : `You joined ${info.name}!`)
      navigate(`/group/${gid}`, { replace: true })
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  if (info === undefined) return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={32} /></div>

  if (!info) {
    return (
      <Screen className="flex flex-col items-center justify-center px-6 text-center">
        <Mascot name="cloudpink" size={150} />
        <h1 className="font-display font-extrabold text-[28px] mt-5">Hmm, that link didn’t work</h1>
        <p className="text-ink-soft font-medium mt-2">Ask your friend to send the invite again.</p>
        <Button className="mt-8" onClick={() => navigate('/', { replace: true })}>Back home</Button>
      </Screen>
    )
  }

  return (
    <Screen className="flex flex-col safe-top">
      <div className="flex-1 flex flex-col items-center px-6 text-center pt-8">
        <div className={`${placeholders.length && !info.is_member ? 'w-32 h-32' : 'w-44 h-44'} rounded-full grad-warm grid place-items-center shadow-pop transition-all`}>
          <Mascot name={info.mascot} size={placeholders.length && !info.is_member ? 88 : 120} />
        </div>
        <p className="mt-5 text-ink-soft font-bold text-[14px] uppercase tracking-wider">You’re invited to</p>
        <h1 className="font-display font-extrabold text-[34px] leading-tight">{info.name}</h1>
        <p className="text-ink-soft font-medium mt-1">{info.member_count} {Number(info.member_count) === 1 ? 'person is' : 'people are'} already here</p>

        {placeholders.length > 0 && !info.is_member && (
          <div className="w-full mt-6 text-left animate-rise">
            <p className="font-display font-bold text-[19px]">Are you one of these?</p>
            <p className="text-[13px] font-semibold text-ink-soft mt-0.5">The host added these people before they joined. Pick yourself and their bills become yours.</p>
            <div className="grid grid-cols-3 gap-2.5 mt-3">
              {placeholders.map((p) => {
                const on = claim === p.id
                return (
                  <button key={p.id} onClick={() => setClaim(on ? null : p.id)} className={`tap card p-3 flex flex-col items-center gap-1.5 border-[3px] transition-colors ${on ? 'border-green' : 'border-transparent'}`} aria-pressed={on}>
                    <span className="relative p-0.5">
                      <Avatar user={on ? { name: p.name } : { id: p.id, name: p.name, is_placeholder: true }} size={52} />
                      {on && <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-green text-white grid place-items-center ring-2 ring-white"><Icon name="check" size={13} stroke={3} /></span>}
                    </span>
                    <span className="font-bold text-[13px] truncate max-w-full">{p.name}</span>
                  </button>
                )
              })}
              <button onClick={() => setClaim(null)} className={`tap card p-3 flex flex-col items-center gap-1.5 border-[3px] transition-colors ${!claim ? 'border-ink' : 'border-transparent'}`} aria-pressed={!claim}>
                <span className="w-[56px] h-[56px] rounded-full bg-cream grid place-items-center text-ink-soft"><Icon name="plus" size={22} /></span>
                <span className="font-bold text-[13px]">I’m new here</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
        {info.is_member ? (
          <Button onClick={() => navigate(`/group/${info.id}`, { replace: true })}>You’re already in. Open group</Button>
        ) : (
          <Button variant="grad" loading={busy} onClick={join}>
            {chosen ? `Join as ${firstName(chosen.name)}` : user ? 'Join group' : 'Create account & join'}
          </Button>
        )}
        {!user && <Button variant="ghost" size="sm" onClick={() => { setPendingJoin(code); setPendingClaim(claim); navigate('/signin') }}>I already have an account</Button>}
      </div>
    </Screen>
  )
}
