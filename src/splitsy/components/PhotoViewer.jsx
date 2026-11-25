import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const MAX = 5
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Full-screen photo preview.
 * Pinch or double-tap to zoom, drag to pan, swipe to change photo,
 * mouse wheel / buttons on desktop, Esc or X to close.
 */
export default function PhotoViewer({ photos, index = 0, onClose }) {
  const [i, setI] = useState(index)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [swipe, setSwipe] = useState(0)
  const box = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(0)
  const list = photos.filter(Boolean)
  const count = list.length

  const reset = () => setView({ s: 1, x: 0, y: 0 })
  const go = useCallback((d) => {
    setI((v) => clamp(v + d, 0, count - 1))
    setView({ s: 1, x: 0, y: 0 })
  }, [count])

  // keep the image inside the screen while zoomed
  const bound = useCallback((v) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || v.s <= 1) return { s: Math.max(1, v.s), x: 0, y: 0 }
    const mx = ((v.s - 1) * r.width) / 2
    const my = ((v.s - 1) * r.height) / 2
    return { s: v.s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) }
  }, [])

  // zoom keeping the point (px, py) — relative to the screen centre — under the finger
  const zoomAt = useCallback((v, s2, px, py) => {
    const s = clamp(s2, 1, MAX)
    const k = s / v.s
    return bound({ s, x: px - k * (px - v.x), y: py - k * (py - v.y) })
  }, [bound])

  const rel = (e) => {
    const r = box.current.getBoundingClientRect()
    return { px: e.clientX - r.left - r.width / 2, py: e.clientY - r.top - r.height / 2 }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [go, onClose])

  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const [a, b] = pts
      const mid = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), start: view, ...mid }
    } else if (pts.length === 1) {
      gesture.current = { type: 'drag', sx: e.clientX, sy: e.clientY, start: view, moved: false }
    }
  }

  const move = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (g.type === 'pinch' && pts.length >= 2) {
      const [a, b] = pts
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      setView(zoomAt(g.start, g.start.s * (d / g.dist), g.px, g.py))
    } else if (g.type === 'drag') {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true
      if (g.start.s > 1) setView(bound({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy }))
      else if (count > 1) setSwipe(dx)
    }
  }

  const up = (e) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.type === 'drag') {
      if (!g.moved) {
        // double-tap to zoom in / out
        const now = Date.now()
        if (now - lastTap.current < 300) {
          const { px, py } = rel(e)
          setView((v) => (v.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(v, 2.5, px, py)))
          lastTap.current = 0
        } else lastTap.current = now
      } else if (g.start.s <= 1 && Math.abs(swipe) > 60) {
        go(swipe < 0 ? 1 : -1)
      }
      setSwipe(0)
    }
    if (pointers.current.size === 0) gesture.current = null
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      gesture.current = { type: 'drag', sx: p.x, sy: p.y, start: view, moved: true }
    }
    if (g?.type === 'pinch') setView((v) => (v.s < 1.03 ? { s: 1, x: 0, y: 0 } : v))
  }

  const wheel = (e) => {
    const { px, py } = rel(e)
    setView((v) => zoomAt(v, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), px, py))
  }

  if (!count) return null
  return (
    <div className="fixed inset-0 z-[70] bg-[#0f0d13] flex flex-col animate-[pop_.15s_ease-out_both]" role="dialog" aria-label="Photo preview">
      <div className="safe-top" />
      <div className="flex items-center gap-2 px-4 h-14 text-white shrink-0">
        <button onClick={onClose} className="tap w-10 h-10 rounded-full bg-white/10 grid place-items-center" aria-label="Close"><Icon name="close" size={22} /></button>
        <span className="flex-1 text-center font-bold text-[14px]">{count > 1 ? `${i + 1} / ${count}` : ''}</span>
        <span className="text-[12px] font-bold text-white/60 w-10 text-right">{view.s > 1 ? `${view.s.toFixed(1)}×` : ''}</span>
      </div>

      <div
        ref={box}
        className="relative flex-1 overflow-hidden touch-none select-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
      >
        <img
          src={list[i]}
          alt=""
          draggable="false"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            transform: `translate(${view.x + swipe}px, ${view.y}px) scale(${view.s})`,
            transition: gesture.current ? 'none' : 'transform 0.2s ease-out',
          }}
        />
        {count > 1 && i > 0 && (
          <button onClick={() => go(-1)} className="tap hidden sm:grid absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white place-items-center" aria-label="Previous photo"><Icon name="back" /></button>
        )}
        {count > 1 && i < count - 1 && (
          <button onClick={() => go(1)} className="tap hidden sm:grid absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white place-items-center" aria-label="Next photo"><Icon name="chevron" /></button>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 py-4 safe-bottom shrink-0">
        <button onClick={() => setView((v) => zoomAt(v, v.s / 1.5, 0, 0))} disabled={view.s <= 1} className="tap w-12 h-12 rounded-full bg-white/10 text-white grid place-items-center disabled:opacity-30" aria-label="Zoom out"><Icon name="zoomOut" size={20} /></button>
        <button onClick={reset} className="tap h-12 px-5 rounded-full bg-white/10 text-white font-bold text-[13px]">{view.s > 1 ? 'Fit to screen' : 'Pinch or double-tap to zoom'}</button>
        <button onClick={() => setView((v) => zoomAt(v, v.s * 1.5, 0, 0))} disabled={view.s >= MAX} className="tap w-12 h-12 rounded-full bg-white/10 text-white grid place-items-center disabled:opacity-30" aria-label="Zoom in"><Icon name="zoomIn" size={20} /></button>
      </div>
    </div>
  )
}
