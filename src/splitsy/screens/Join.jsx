import { useEffect, useState } from 'react'
import { Screen, Mascot, Button, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { useAuth, setPendingJoin } from '../auth'

export default function Join({ code }) {
  const { user } = useAuth()
  const [info, setInfo] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api.previewInvite(code).then(setInfo).catch(() => setInfo(null))
  }, [code, user])

  const join = async () => {
    if (!user) {
      setPendingJoin(code)
      navigate('/signup')
      return
    }
    setBusy(true)
    try {
      const gid = await api.joinGroup(code)
      toast(`You joined ${info.name}!`)
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-44 h-44 rounded-full grad-warm grid place-items-center shadow-pop">
          <Mascot name={info.mascot} size={120} />
        </div>
        <p className="mt-6 text-ink-soft font-bold text-[14px] uppercase tracking-wider">You’re invited to</p>
        <h1 className="font-display font-extrabold text-[36px] leading-tight">{info.name}</h1>
        <p className="text-ink-soft font-medium mt-1">{info.member_count} {Number(info.member_count) === 1 ? 'friend is' : 'friends are'} already here</p>
      </div>
      <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
        {info.is_member ? (
          <Button onClick={() => navigate(`/group/${info.id}`, { replace: true })}>You’re already in — open group</Button>
        ) : (
          <Button variant="grad" loading={busy} onClick={join}>{user ? 'Join group' : 'Create account & join'}</Button>
        )}
        {!user && <Button variant="ghost" size="sm" onClick={() => { setPendingJoin(code); navigate('/signin') }}>I already have an account</Button>}
      </div>
    </Screen>
  )
}
