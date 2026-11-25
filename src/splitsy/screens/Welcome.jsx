import { Screen, Mascot, Button } from '../components/ui'
import { navigate } from '../lib/router'
import { api } from '../lib/api'

export default function Welcome() {
  return (
    <Screen className="flex flex-col">
      <div className="relative mx-3 mt-3 rounded-[36px] grad-warm overflow-hidden flex-1 min-h-[250px] max-h-[48dvh] safe-top">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 15%, #fff 0 2px, transparent 3px), radial-gradient(circle at 80% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 60% 80%, #fff 0 2px, transparent 3px)', backgroundSize: '120px 120px' }} />
        <Mascot name="sun" size={92} className="absolute left-3 top-8" style={{ animationDelay: '.3s' }} />
        <Mascot name="heart" size={84} className="absolute right-4 top-12" style={{ animationDelay: '.9s' }} />
        <div className="absolute inset-0 grid place-items-center"><Mascot name="buddy" size={150} /></div>
        <Mascot name="strawberry" size={78} className="absolute left-3 bottom-4" style={{ animationDelay: '1.4s' }} />
        <Mascot name="icecream" size={66} className="absolute right-6 bottom-6" style={{ animationDelay: '.6s' }} />
        <img src="/apps/splitsy/mascots/stars.png" alt="" className="absolute right-[38%] top-[22%] w-12 animate-wiggle" />
      </div>

      <div className="px-8 pt-6 pb-1 text-center animate-rise">
        <h1 className="font-display font-extrabold text-[46px] leading-none tracking-tight">Splitsy</h1>
        <p className="mt-3 text-ink-soft font-medium text-[16px] leading-relaxed">
          Snap it, split it, done. Your cute little assistant for sharing bills with friends.
        </p>
      </div>

      <div className="px-6 pt-4 safe-bottom flex flex-col gap-3">
        <Button variant="grad" onClick={() => navigate('/signup')}>Let&apos;s get started ✨</Button>
        <Button variant="ghost" size="md" onClick={() => navigate('/signin')}>I already have an account</Button>
        {api.mode === 'demo' && (
          <p className="text-center text-[12px] text-ink-faint font-semibold -mt-1">Demo mode · saved on this phone only</p>
        )}
      </div>
    </Screen>
  )
}
