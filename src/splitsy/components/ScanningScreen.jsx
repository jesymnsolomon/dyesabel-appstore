import { Mascot } from './ui'
import Icon from './Icon'

const PHOTO_STAGES = [
  { at: 0, label: 'Getting your photo ready', icon: 'image' },
  { at: 0.08, label: 'Cleaning it up', icon: 'sparkles' },
  { at: 0.35, label: 'Reading all the text', icon: 'scan' },
  { at: 0.75, label: 'Recognising what’s in it', icon: 'eye' },
  { at: 0.98, label: 'Filling in the details', icon: 'edit' },
]

const STAGES = [
  { at: 0, label: 'Getting your photo ready', icon: 'image' },
  { at: 0.08, label: 'Cleaning up shadows & pen marks', icon: 'sparkles' },
  { at: 0.35, label: 'Reading every line', icon: 'scan' },
  { at: 0.75, label: 'Double-checking the total', icon: 'calculator' },
  { at: 0.98, label: 'Finding your items', icon: 'receipt' },
]

/** Full-screen loader shown while a receipt is being read. */
export default function ScanningScreen({ photoUrl, progress = 0, onCancel, kind = 'receipt' }) {
  const stages = kind === 'photo' ? PHOTO_STAGES : STAGES
  const current = [...stages].reverse().find((s) => progress >= s.at) || stages[0]
  const idx = stages.indexOf(current)
  const pct = Math.max(3, Math.min(100, Math.round(progress * 100)))
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-[pop_.2s_ease-out_both]" role="status" aria-live="polite">
      <style>{'@keyframes scanbeam{0%{top:-30%}100%{top:100%}}'}</style>
      <div className="safe-top" />
      <div className="flex-1 w-full max-w-md mx-auto px-6 flex flex-col items-center justify-center">
        <div className="relative w-56 h-72 rounded-[28px] overflow-hidden bg-white shadow-card rotate-[-2deg]">
          {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-ink-faint"><Icon name="receipt" size={56} /></div>}
          <div className="absolute inset-0 bg-ink/10" />
          <div className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-pink/40 to-transparent animate-[scanbeam_1.6s_ease-in-out_infinite]" />
          <div className="absolute inset-x-0 h-[3px] bg-pink shadow-[0_0_16px_4px_rgba(255,111,181,0.6)] animate-[scanbeam_1.6s_ease-in-out_infinite]" />
        </div>
        <Mascot name="cloudpurple" size={84} anim="wiggle" className="-mt-10 relative" />

        <h1 className="font-display font-extrabold text-[26px] mt-3 text-center">{kind === 'photo' ? 'Looking at your photo…' : 'Reading your receipt…'}</h1>
        <p className="text-ink-soft font-semibold text-[14px] mt-1 text-center">This takes a few seconds. You can fix anything after.</p>

        <div className="w-full mt-6">
          <div className="flex justify-between text-[13px] font-bold">
            <span className="flex items-center gap-1.5"><Icon name={current.icon} size={15} className="text-purple" /> {current.label}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-ink/10 mt-2 overflow-hidden">
            <div className="h-full grad-btn rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-3">
            {stages.map((s, i) => (
              <span key={s.label} className={`w-8 h-8 rounded-full grid place-items-center transition-colors ${i < idx ? 'bg-green text-white' : i === idx ? 'bg-ink text-white' : 'bg-white text-ink-faint'}`}>
                <Icon name={i < idx ? 'check' : s.icon} size={15} stroke={i < idx ? 3 : 2.2} />
              </span>
            ))}
          </div>
        </div>
      </div>
      {onCancel && (
        <div className="w-full max-w-md mx-auto px-6 pb-2 safe-bottom">
          <button onClick={onCancel} className="tap w-full h-12 rounded-full font-bold text-[15px] text-ink-soft">Cancel</button>
        </div>
      )}
    </div>
  )
}
