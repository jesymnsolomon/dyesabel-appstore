import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react'
import Icon from './Icon'
import { back } from '../lib/router'

export const MASCOTS = {
  buddy: { label: 'Buddy', bg: 'linear-gradient(135deg,#d7f7e3,#b9f0d0)' },
  sun: { label: 'Sunny', bg: 'linear-gradient(135deg,#fff1c2,#ffd98a)' },
  strawberry: { label: 'Berry', bg: 'linear-gradient(135deg,#ffe0d6,#ffc2b0)' },
  bear: { label: 'Bubu', bg: 'linear-gradient(135deg,#ece6ff,#d6caff)' },
  heart: { label: 'Lovey', bg: 'linear-gradient(135deg,#ffe2dc,#ffb9ab)' },
  icecream: { label: 'Scoop', bg: 'linear-gradient(135deg,#ffe8f3,#ffcfe5)' },
  flower: { label: 'Daisy', bg: 'linear-gradient(135deg,#ffeaf6,#fbd3ec)' },
  thumb: { label: 'Thumbs', bg: 'linear-gradient(135deg,#dff1ff,#bfe3ff)' },
  tulip: { label: 'Tuli', bg: 'linear-gradient(135deg,#ffe6dc,#ffcab8)' },
  cloudpurple: { label: 'Nimbus', bg: 'linear-gradient(135deg,#eeeaff,#d9d0ff)' },
  bubble: { label: 'Blinky', bg: 'linear-gradient(135deg,#e0f3ff,#c4e8ff)' },
  cloudpink: { label: 'Mopey', bg: 'linear-gradient(135deg,#ffeef6,#ffd9ea)' },
}

export const mascotSrc = (name) => `/apps/splitsy/mascots/${MASCOTS[name] ? name : 'buddy'}.png`

export function Mascot({ name = 'buddy', size = 96, anim = 'float', className = '', style }) {
  const a = anim === 'float' ? 'animate-float' : anim === 'wiggle' ? 'animate-wiggle' : anim === 'pop' ? 'animate-pop' : ''
  return <img src={mascotSrc(name)} alt="" draggable="false" width={size} style={{ width: size, ...style }} className={`select-none pointer-events-none drop-shadow-[0_10px_14px_rgba(22,19,28,0.15)] ${a} ${className}`} />
}

/** The friendly assistant line at the top of flows. */
export function Assistant({ mascot = 'buddy', children, sub, size = 72 }) {
  return (
    <div className="flex items-end gap-3 animate-rise">
      <Mascot name={mascot} size={size} anim="wiggle" className="shrink-0 -mb-1" />
      <div className="relative card px-4 py-3 rounded-bl-md">
        <p className="font-display font-bold text-[19px] leading-snug text-ink">{children}</p>
        {sub && <p className="text-[13px] text-ink-soft mt-0.5 font-medium">{sub}</p>}
      </div>
    </div>
  )
}

const AV_COLORS = ['#FFD23F', '#FF8A3D', '#FF6FB5', '#9B7BFF', '#3DA9F5', '#2BBF6A']
export function Avatar({ user, size = 40, ring = false, className = '' }) {
  const name = user?.name || '?'
  const color = AV_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_COLORS.length]
  const style = { width: size, height: size, fontSize: size * 0.4 }
  const ringCls = ring ? 'ring-[3px] ring-white' : ''
  if (user?.avatar_url) return <img src={user.avatar_url} alt={name} style={style} className={`rounded-full object-cover bg-lilac shrink-0 ${ringCls} ${className}`} />
  return (
    <div style={{ ...style, background: color }} className={`rounded-full grid place-items-center font-display font-extrabold text-ink shrink-0 ${ringCls} ${className}`}>
      {name.trim()[0]?.toUpperCase()}
    </div>
  )
}

export function AvatarStack({ users = [], size = 30, max = 4 }) {
  const shown = users.slice(0, max)
  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <Avatar key={u.id} user={u} size={size} ring className={i ? '-ml-2.5' : ''} />
      ))}
      {users.length > max && (
        <div style={{ width: size, height: size }} className="-ml-2.5 rounded-full ring-[3px] ring-white bg-ink text-white grid place-items-center text-[11px] font-bold">+{users.length - max}</div>
      )}
    </div>
  )
}

export function Button({ variant = 'dark', size = 'lg', className = '', loading, children, ...props }) {
  const v = {
    dark: 'bg-ink text-white shadow-ink',
    grad: 'grad-btn text-white shadow-pop',
    soft: 'bg-white text-ink border-2 border-line',
    ghost: 'bg-transparent text-ink-soft',
    danger: 'bg-[#fdecec] text-red',
  }[variant]
  const s = { lg: 'h-14 px-6 text-[16px]', md: 'h-12 px-5 text-[15px]', sm: 'h-10 px-4 text-[14px]' }[size]
  return (
    <button {...props} disabled={props.disabled || loading} className={`tap inline-flex items-center justify-center gap-2 rounded-full font-bold disabled:opacity-50 disabled:active:scale-100 ${v} ${s} ${className}`}>
      {loading ? <Spinner light={variant === 'dark' || variant === 'grad'} /> : children}
    </button>
  )
}

export function Spinner({ light, size = 20 }) {
  return <span style={{ width: size, height: size }} className={`inline-block rounded-full border-[3px] animate-spin ${light ? 'border-white/30 border-t-white' : 'border-ink/15 border-t-ink'}`} />
}

export function TopBar({ title, onBack, right, fallback = '/' }) {
  return (
    <div className="sticky top-0 z-30 bg-cream/85 backdrop-blur-xl safe-top">
      <div className="h-14 px-4 flex items-center gap-3">
        <button onClick={onBack || (() => back(fallback))} className="tap w-10 h-10 rounded-full bg-white shadow-card grid place-items-center" aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="flex-1 font-display font-bold text-[18px] truncate">{title}</h1>
        {right}
      </div>
    </div>
  )
}

export function Screen({ children, className = '' }) {
  return <div className={`min-h-[100dvh] w-full max-w-md mx-auto relative ${className}`}>{children}</div>
}

/** Hidden file input that opens the camera on phones. */
export function PhotoInput({ onPick, facing = 'environment', multiple = false, children, className = '' }) {
  const ref = useRef(null)
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture={facing}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])]
          e.target.value = ''
          if (files.length) onPick(multiple ? files : files[0])
        }}
      />
    </>
  )
}

/** A file picker from the gallery (no camera capture). */
export function GalleryInput({ onPick, multiple = true, children, className = '' }) {
  const ref = useRef(null)
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>{children}</button>
      <input ref={ref} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => {
        const files = [...(e.target.files || [])]
        e.target.value = ''
        if (files.length) onPick(multiple ? files : files[0])
      }} />
    </>
  )
}

export function useObjectURL(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) return setUrl(null)
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

/** Object URLs for several files at once (cleaned up automatically). */
export function useObjectURLs(files) {
  const [urls, setUrls] = useState([])
  useEffect(() => {
    const list = (files || []).filter(Boolean).map((f) => URL.createObjectURL(f))
    setUrls(list)
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [files])
  return urls
}

/**
 * Tracks the part of the screen not covered by the phone keyboard.
 * iOS/Android keep "fixed" elements anchored behind the keyboard, so sheets
 * use this to sit on top of it instead.
 */
export function useKeyboardSafeArea(active) {
  const [area, setArea] = useState({ bottom: 0, height: null })
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => {
      const bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setArea({ bottom, height: vv.height })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return area
}

/**
 * Bottom sheet.
 * - `tall`: fixed height (good for searchable lists, so the search box never jumps).
 * - `header`: content pinned above the scrolling area (e.g. a search box).
 */
export function Sheet({ open, onClose, children, title, header, tall = false }) {
  const kb = useKeyboardSafeArea(open)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  const avail = kb.height || (typeof window !== 'undefined' ? window.innerHeight : 800)
  const maxH = Math.round(avail * 0.92)
  const style = { bottom: kb.bottom, maxHeight: maxH, ...(tall && { height: Math.min(maxH, Math.round(avail * 0.86)) }) }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-[pop_.2s_ease-out_both]" onClick={onClose} />
      <div className="absolute left-0 right-0 mx-auto w-full max-w-md bg-paper rounded-t-[32px] animate-rise flex flex-col transition-[bottom] duration-150" style={style}>
        <div className="px-5 pt-3 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-line mx-auto mb-3" />
          {title && <h3 className="font-display font-bold text-[20px] mb-4">{title}</h3>}
          {header}
        </div>
        <div className={`px-5 overflow-y-auto overscroll-contain flex-1 min-h-0 ${kb.bottom > 0 ? 'pb-3' : 'safe-bottom'}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`tap h-[72px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-[14px] transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink'}`}>
            {o.icon && <Icon name={o.icon} size={22} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Confetti({ count = 26 }) {
  const colors = ['#FFD23F', '#FF8A3D', '#FF6FB5', '#9B7BFF', '#3DA9F5', '#2BBF6A']
  const bits = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const dist = 110 + Math.random() * 90
    return {
      '--x': `${Math.cos(angle) * dist}px`, '--y': `${Math.sin(angle) * dist + 60}px`, '--r': `${Math.random() * 720 - 360}deg`,
      background: colors[i % colors.length], animationDelay: `${Math.random() * 0.15}s`,
      borderRadius: i % 3 ? '3px' : '50%', width: i % 2 ? 10 : 8, height: i % 2 ? 14 : 8,
    }
  })
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/3">
      {bits.map((s, i) => <span key={i} style={s} className="absolute animate-confetti" />)}
    </div>
  )
}

// ---------- toasts ----------
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  const timer = useRef()
  const show = useCallback((msg, kind = 'ok') => {
    clearTimeout(timer.current)
    setT({ msg, kind, k: Date.now() })
    timer.current = setTimeout(() => setT(null), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div key={t.k} className="fixed z-[60] left-0 right-0 top-0 safe-top px-4 flex justify-center pointer-events-none">
          <div className={`mt-2 animate-rise rounded-full px-5 py-3 font-bold text-[14px] shadow-ink flex items-center gap-2 max-w-sm ${t.kind === 'error' ? 'bg-red text-white' : 'bg-ink text-white'}`}>
            <Icon name={t.kind === 'error' ? 'alert' : 'sparkles'} size={17} /> {t.msg}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function Empty({ mascot = 'cloudpurple', title, children }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-6">
      <Mascot name={mascot} size={110} />
      <p className="font-display font-bold text-[20px] mt-3">{title}</p>
      <div className="text-ink-soft text-[14px] mt-1 font-medium">{children}</div>
    </div>
  )
}
