import { useEffect, useState } from 'react'
import { Screen, Mascot, Button, Confetti, useToast } from '../components/ui'
import Icon from '../components/Icon'
import { api } from '../lib/api'
import { navigate, inviteLink } from '../lib/router'

export async function shareInvite(group, toast) {
  const url = inviteLink(group.invite_code)
  const text = `Join "${group.name}" on Splitsy so we can split bills easily`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Splitsy invite', text, url })
      return
    } catch (e) {
      if (e.name === 'AbortError') return
    }
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`)
  toast('Invite link copied!')
}

export default function Invite({ groupId }) {
  const [group, setGroup] = useState(null)
  const toast = useToast()
  useEffect(() => { api.getGroup(groupId).then(setGroup).catch((e) => toast(e.message, 'error')) }, [groupId, toast])

  if (!group) return null
  const link = inviteLink(group.invite_code)

  return (
    <Screen className="flex flex-col safe-top">
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center">
        <Confetti />
        <Mascot name={group.mascot} size={150} anim="pop" />
        <h1 className="font-display font-extrabold text-[32px] leading-tight mt-5 animate-rise">{group.name} is ready!</h1>
        <p className="text-ink-soft font-medium mt-2 animate-rise">Now invite your friends. Anyone with this link can join.</p>

        <div className="card w-full mt-7 p-4 text-left animate-rise" style={{ animationDelay: '.1s' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Invite code</p>
          <p className="font-display font-extrabold text-[30px] tracking-[0.18em] mt-0.5">{group.invite_code}</p>
          <button onClick={async () => { await navigator.clipboard?.writeText(link); toast('Link copied!') }} className="tap mt-3 w-full h-12 rounded-2xl bg-cream flex items-center gap-2 px-3 text-left">
            <Icon name="link" size={18} className="text-ink-soft shrink-0" />
            <span className="flex-1 truncate text-[13px] font-semibold text-ink-soft">{link}</span>
            <Icon name="copy" size={18} />
          </button>
        </div>
      </div>
      <div className="px-5 pt-6 safe-bottom flex flex-col gap-2">
        <Button variant="grad" onClick={() => shareInvite(group, toast)}><Icon name="share" size={19} /> Share invite link</Button>
        <Button variant="ghost" size="md" onClick={() => navigate(`/group/${group.id}`, { replace: true })}>Go to group →</Button>
      </div>
    </Screen>
  )
}
