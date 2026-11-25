import { useEffect, useState } from 'react'
import { Button, useToast } from './ui'
import Icon from './Icon'
import { pushStatus, enablePush, disablePush } from '../lib/push'
import { api } from '../lib/api'

/** Turn phone notifications on/off, with the right hint for each phone. */
export default function PushCard({ compact = false }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus('unsupported')) }, [])
  if (!status || (compact && status === 'not-configured' && api.mode === 'demo')) return null

  const toggle = async () => {
    setBusy(true)
    try {
      if (status === 'on') { await disablePush(); setStatus('off'); toast('Phone notifications off') }
      else { await enablePush(); setStatus('on'); toast('Phone notifications on!') }
    } catch (e) {
      toast(e.message, 'error')
      setStatus(await pushStatus().catch(() => 'off'))
    } finally {
      setBusy(false)
    }
  }

  const copy = {
    on: ['Phone notifications are on', 'You’ll hear about new bills even when Splitsy is closed.'],
    off: ['Get notified on your phone', 'Know right away when someone adds a bill, even when Splitsy is closed.'],
    blocked: ['Notifications are blocked', 'Allow notifications for this site in your browser or phone settings, then come back.'],
    'needs-install': ['Add Splitsy to your Home Screen', 'On iPhone, tap Share → “Add to Home Screen”, open Splitsy from there, then turn on notifications.'],
    unsupported: ['Not available on this browser', 'Try Chrome on Android, or Safari after adding Splitsy to your Home Screen.'],
    'not-configured': ['Phone notifications aren’t set up yet', api.mode === 'demo' ? 'Available once Splitsy is connected to Supabase.' : 'Add the push keys from the README to turn them on.'],
  }[status]

  return (
    <div className={`card p-4 flex items-start gap-3 ${status === 'on' ? '' : ''}`}>
      <span className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${status === 'on' ? 'bg-mint text-green' : 'bg-lilac text-purple'}`}><Icon name="bell" size={21} /></span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[15px]">{copy[0]}</p>
        <p className="text-[13px] font-semibold text-ink-soft mt-0.5">{copy[1]}</p>
        {(status === 'on' || status === 'off') && (
          <Button size="sm" variant={status === 'on' ? 'soft' : 'dark'} className="mt-3" loading={busy} onClick={toggle}>
            {status === 'on' ? 'Turn off' : 'Turn on notifications'}
          </Button>
        )}
      </div>
    </div>
  )
}
