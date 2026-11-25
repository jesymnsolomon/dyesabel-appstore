import { useState } from 'react'
import { Screen, TopBar, Assistant, Button, MASCOTS, useToast } from '../components/ui'
import { api } from '../lib/api'
import { navigate } from '../lib/router'
import { CurrencyPicker } from '../components/CurrencyPicker'
import { currencySymbol, currencyName } from '../lib/currency'

const IDEAS = ['Barkada Trip', 'Roomies', 'Office Lunch', 'Date Nights', 'Family Outing']

export default function CreateGroup() {
  const [name, setName] = useState('')
  const [mascot, setMascot] = useState('sun')
  const [currency, setCurrency] = useState('PHP')
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const toast = useToast()

  const create = async () => {
    setBusy(true)
    try {
      const g = await api.createGroup({ name: name.trim(), mascot, currency })
      navigate(`/group/${g.id}/invite`, { replace: true })
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <Screen className="flex flex-col">
      <TopBar title="New group" />
      <div className="px-5 pt-3 flex-1 flex flex-col gap-6">
        <Assistant mascot={mascot} sub="Pick a name and a little mascot for it.">Ooh, a new crew! What’s it called?</Assistant>

        <div className="animate-rise">
          <input autoFocus className="field text-[19px] h-16" placeholder="e.g. Baguio Getaway" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar -mx-5 px-5">
            {IDEAS.map((i) => (
              <button key={i} onClick={() => setName(i)} className="tap shrink-0 h-9 px-3.5 rounded-full bg-white border-2 border-line text-[13px] font-bold">{i}</button>
            ))}
          </div>
        </div>

        <div className="animate-rise" style={{ animationDelay: '.05s' }}>
          <p className="font-bold text-[14px] text-ink-soft mb-2.5">Group mascot</p>
          <div className="grid grid-cols-4 gap-2.5">
            {Object.entries(MASCOTS).map(([key, m]) => (
              <button key={key} onClick={() => setMascot(key)} className={`tap aspect-square rounded-[22px] grid place-items-center border-[3px] transition-colors ${mascot === key ? 'border-ink' : 'border-transparent'}`} style={{ background: m.bg }}>
                <img src={`/apps/splitsy/mascots/${key}.png`} alt={m.label} className="w-[70%] max-h-[70%] object-contain" />
              </button>
            ))}
          </div>
        </div>

        <div className="animate-rise" style={{ animationDelay: '.1s' }}>
          <p className="font-bold text-[14px] text-ink-soft mb-2.5">Main currency</p>
          <button onClick={() => setPickerOpen(true)} className="tap w-full card p-3.5 flex items-center gap-3 text-left">
            <span className="w-12 h-12 rounded-2xl bg-cream grid place-items-center font-display font-extrabold text-[18px] shrink-0">{currencySymbol(currency)}</span>
            <span className="flex-1">
              <span className="block font-bold text-[16px]">{currencyName(currency)}</span>
              <span className="block text-[12px] font-semibold text-ink-faint">{currency} · {currencySymbol(currency)} — tap to see all currencies</span>
            </span>
            <span className="text-ink-faint font-bold text-[13px]">Change</span>
          </button>
          <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            {['PHP', 'USD', 'JPY', 'KRW', 'SGD', 'EUR', 'THB'].map((code) => (
              <button key={code} onClick={() => setCurrency(code)} className={`tap shrink-0 h-9 px-3.5 rounded-full border-2 font-bold text-[13px] ${currency === code ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>
                {currencySymbol(code)} {code}
              </button>
            ))}
          </div>
          <p className="text-[12px] font-semibold text-ink-faint mt-2">You can still add expenses in other currencies. Splitsy converts them for you.</p>
        </div>
      </div>
      <CurrencyPicker open={pickerOpen} onClose={() => setPickerOpen(false)} value={currency} onPick={setCurrency} title="Group currency" />
      <div className="px-5 pt-6 safe-bottom">
        <Button className="w-full" variant="grad" disabled={!name.trim()} loading={busy} onClick={create}>Create group</Button>
      </div>
    </Screen>
  )
}
