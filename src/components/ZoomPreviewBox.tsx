import { useEffect, useState, useRef } from 'react'
import { MousePointer2, Play, Pause, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'

interface ZoomPreviewProps {
  zoomFactor: number
  zoomKey: string
  zoomSpeed: number
  zoomRadius?: number
  zoomBezier?: [number, number, number, number]
}

export function ZoomPreviewBox({
  zoomFactor,
  zoomKey,
  zoomSpeed,
  zoomRadius = 16,
  zoomBezier = [0.22, 1.0, 0.36, 1.0],
}: ZoomPreviewProps) {
  const [isHeld, setIsHeld] = useState(false)
  const [autoDemo, setAutoDemo] = useState(true)
  const autoDemoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Calculate CSS transition duration in seconds
  // Handles both new direct seconds (e.g. 0.45s) and legacy rates (0.08, 0.12, 0.22)
  const transitionSec =
    zoomSpeed === 0.08
      ? 0.70
      : zoomSpeed === 0.12
        ? 0.45
        : zoomSpeed === 0.22
          ? 0.25
          : Math.max(0.05, Math.min(3.0, zoomSpeed))
  const bezierStr = `cubic-bezier(${zoomBezier.join(',')})`

  // Auto-demo cycle: zoom in for 2s, zoom out for 2s
  useEffect(() => {
    if (!autoDemo) {
      if (autoDemoTimerRef.current) clearInterval(autoDemoTimerRef.current)
      return
    }

    let state = false
    autoDemoTimerRef.current = setInterval(() => {
      state = !state
      setIsHeld(state)
    }, 2200)

    return () => {
      if (autoDemoTimerRef.current) clearInterval(autoDemoTimerRef.current)
    }
  }, [autoDemo])

  // Global key listener inside window when testing
  useEffect(() => {
    const targetKey = zoomKey.toLowerCase().trim()

    const handleKeyDown = (e: KeyboardEvent) => {
      let match = false
      if (targetKey === 'ctrl' && (e.key === 'Control' || e.ctrlKey)) match = true
      else if (targetKey === 'alt' && (e.key === 'Alt' || e.altKey)) match = true
      else if (targetKey === 'shift' && (e.key === 'Shift' || e.shiftKey)) match = true
      else if (targetKey === 'space' && e.code === 'Space') match = true
      else if (targetKey === 'z' && e.key.toLowerCase() === 'z') match = true
      else if (targetKey === 'c' && e.key.toLowerCase() === 'c') match = true

      if (match) {
        setAutoDemo(false)
        setIsHeld(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      let match = false
      if (targetKey === 'ctrl' && e.key === 'Control') match = true
      else if (targetKey === 'alt' && e.key === 'Alt') match = true
      else if (targetKey === 'shift' && e.key === 'Shift') match = true
      else if (targetKey === 'space' && e.code === 'Space') match = true
      else if (targetKey === 'z' && e.key.toLowerCase() === 'z') match = true
      else if (targetKey === 'c' && e.key.toLowerCase() === 'c') match = true

      if (match) {
        setIsHeld(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [zoomKey])

  // Simulated zoom coordinates towards a feature card in mock UI
  // When zoomed in, pan camera towards center-right feature card
  const panX = isHeld ? -42 : 0
  const panY = isHeld ? -20 : 0
  const currentScale = isHeld ? zoomFactor : 1.0

  return (
    <div className="space-y-2 rounded-lg border border-line bg-raised/30 p-3">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5 text-[11px]">
          <Sparkles size={12} className="text-signal" /> Live Camera Zoom Preview
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-ink-dim">
            {isHeld ? (
              <span className="text-signal font-semibold animate-pulse">
                Holding [{zoomKey.toUpperCase()}] ({zoomFactor}x)
              </span>
            ) : (
              <span className="text-ink-faint">Full View (1.0x)</span>
            )}
          </span>

          <button
            onClick={() => {
              setAutoDemo(!autoDemo)
              if (autoDemo) setIsHeld(false)
            }}
            title={autoDemo ? 'Pause auto-demo loop' : 'Play auto-demo loop'}
            className={cn(
              'flex h-5 items-center gap-1 rounded px-1.5 font-mono text-[10px] transition-colors border',
              autoDemo
                ? 'border-signal/40 bg-signal/15 text-signal'
                : 'border-line text-ink-faint hover:text-ink',
            )}
          >
            {autoDemo ? <Pause size={10} /> : <Play size={10} />}
            <span>{autoDemo ? 'Auto' : 'Manual'}</span>
          </button>
        </div>
      </div>

      {/* Viewport Simulation Box */}
      <div className="relative h-44 w-full overflow-hidden rounded-md border border-line-strong bg-[#0d0f14] select-none shadow-inner">
        {/* Mock Screen Content */}
        <div
          className="h-full w-full p-3 transition-transform will-change-transform flex flex-col justify-between"
          style={{
            transform: `scale(${currentScale}) translate(${panX}px, ${panY}px)`,
            transformOrigin: '50% 50%',
            transitionDuration: `${transitionSec}s`,
            transitionTimingFunction: bezierStr,
            borderRadius: isHeld ? `${zoomRadius}px` : '4px',
          }}
        >
          {/* Mock Window Top Bar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/80" />
              <span className="h-2 w-2 rounded-full bg-amber-500/80" />
              <span className="h-2 w-2 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-[9px] text-white/40">app.tsx — Workspace</span>
            </div>
            <div className="h-2 w-12 rounded-full bg-white/10" />
          </div>

          {/* Mock Main UI Layout */}
          <div className="grid grid-cols-3 gap-2 my-auto">
            <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1.5">
              <div className="h-2 w-10 rounded bg-signal/60" />
              <div className="h-1.5 w-full rounded bg-white/20" />
              <div className="h-1.5 w-2/3 rounded bg-white/10" />
            </div>

            {/* Target Card cursor zooms onto */}
            <div
              className={cn(
                'rounded border p-2 space-y-1.5 transition-colors relative',
                isHeld
                  ? 'border-signal bg-signal/20 shadow-lg'
                  : 'border-white/10 bg-white/5',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="h-2 w-12 rounded bg-signal" />
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              </div>
              <div className="h-1.5 w-full rounded bg-white/30" />
              <div className="h-1.5 w-4/5 rounded bg-white/20" />
              <div className="h-3 w-14 rounded bg-signal/40 mt-1 flex items-center justify-center font-mono text-[7px] text-white font-bold">
                Deploy
              </div>

              {/* Glowing Virtual Cursor */}
              <div
                className="absolute top-4 right-3 text-signal pointer-events-none transition-all duration-300"
                style={{
                  filter: isHeld ? 'drop-shadow(0 0 6px rgba(234,88,12,0.8))' : 'none',
                  transform: isHeld ? 'scale(1.2)' : 'scale(1)',
                }}
              >
                <MousePointer2 size={15} className="fill-signal" />
              </div>
            </div>

            <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1.5">
              <div className="h-2 w-8 rounded bg-white/40" />
              <div className="h-1.5 w-full rounded bg-white/20" />
              <div className="h-1.5 w-1/2 rounded bg-white/10" />
            </div>
          </div>

          {/* Mock Statusbar */}
          <div className="flex items-center justify-between border-t border-white/10 pt-1 font-mono text-[8px] text-white/30">
            <span>Ready · 60 FPS</span>
            <span>UTF-8</span>
          </div>
        </div>

        {/* Viewport Reticle Indicator */}
        <div className="absolute inset-0 pointer-events-none border border-white/5 flex items-center justify-center">
          {isHeld && (
            <div className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-signal font-semibold border border-signal/30 backdrop-blur-sm">
              CAMERA {zoomFactor.toFixed(1)}x ZOOM
            </div>
          )}
        </div>
      </div>

      {/* Interactive Hold-to-Test Control Button */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-ink-dim">
          Press or hold <kbd className="rounded border border-line bg-raised px-1 py-0.5 font-mono text-[10px] text-signal font-bold">[{zoomKey.toUpperCase()}]</kbd> key to test
        </p>

        <button
          onMouseDown={() => {
            setAutoDemo(false)
            setIsHeld(true)
          }}
          onMouseUp={() => setIsHeld(false)}
          onMouseLeave={() => setIsHeld(false)}
          onTouchStart={() => {
            setAutoDemo(false)
            setIsHeld(true)
          }}
          onTouchEnd={() => setIsHeld(false)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-all select-none cursor-pointer active:scale-95 shadow-sm border',
            isHeld
              ? 'border-signal bg-signal text-white'
              : 'border-line hover:border-line-strong bg-raised hover:bg-raised/80 text-ink',
          )}
        >
          <MousePointer2 size={12} />
          <span>{isHeld ? 'Zooming in…' : 'Hold Button to Test'}</span>
        </button>
      </div>
    </div>
  )
}
