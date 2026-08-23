import { useEffect, useState, useCallback } from 'react'
import { Pause, Play, Square, X, GripVertical, Radio, Sparkles } from 'lucide-react'

type OverlayStatus = 'ready' | 'countdown' | 'recording' | 'paused' | 'converting'

export function RecordOverlay() {
  const [status, setStatus] = useState<OverlayStatus>('ready')
  const [countdown, setCountdown] = useState(3)
  const [seconds, setSeconds] = useState(0)
  const [maxSeconds, setMaxSeconds] = useState(10)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('overlay-mode')
    document.body.classList.add('overlay-mode')
    document.documentElement.style.backgroundColor = 'transparent'
    document.body.style.backgroundColor = 'transparent'

    // Request initial status from main window
    window.bench?.sendRecordAction({ type: 'request_status' })

    const unsub = window.bench?.onRecordAction((action) => {
      if (action.type === 'status_update' && action.payload) {
        if (action.payload.status) {
          setStatus(action.payload.status as OverlayStatus)
        }
        if (typeof action.payload.seconds === 'number') {
          setSeconds(action.payload.seconds)
        }
        if (typeof action.payload.maxSeconds === 'number') {
          setMaxSeconds(action.payload.maxSeconds)
        }
        if (typeof action.payload.paused === 'boolean') {
          setIsPaused(action.payload.paused)
        }
        if (typeof action.payload.countdown === 'number') {
          setCountdown(action.payload.countdown)
        }
      }
    })

    return () => {
      document.documentElement.classList.remove('overlay-mode')
      document.body.classList.remove('overlay-mode')
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
      unsub?.()
    }
  }, [])

  const handleStart = useCallback(() => {
    window.bench?.sendRecordAction({ type: 'start' })
  }, [])

  const handleTogglePause = useCallback(() => {
    if (isPaused) {
      window.bench?.sendRecordAction({ type: 'resume' })
      setIsPaused(false)
    } else {
      window.bench?.sendRecordAction({ type: 'pause' })
      setIsPaused(true)
    }
  }, [isPaused])

  const handleStop = useCallback(() => {
    window.bench?.sendRecordAction({ type: 'stop' })
  }, [])

  const handleCancel = useCallback(() => {
    window.bench?.sendRecordAction({ type: 'cancel' })
  }, [])

  const isLimited = maxSeconds > 0
  const percent = isLimited ? Math.min(100, Math.max(0, (seconds / maxSeconds) * 100)) : 100
  const formattedSec = seconds.toFixed(1)

  return (
    <div className="flex h-screen w-screen items-center justify-center p-1 bg-transparent select-none">
      <div
        className="flex items-center gap-3 rounded-full border border-white/20 bg-[#14161f]/95 px-3.5 py-2 shadow-2xl backdrop-blur-md text-ink cursor-move transition-all duration-150"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Grip Handle */}
        <div className="flex items-center text-white/40 hover:text-white/70">
          <GripVertical size={14} />
        </div>

        {/* State 1: READY TO RECORD */}
        {status === 'ready' && (
          <>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] font-semibold text-white">Ready to Record</span>
                <span className="text-[10px] text-white/50">{isLimited ? `Max ${maxSeconds}s` : 'No Time Limit'}</span>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 ml-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={handleStart}
                title="Start Screen Recording"
                className="flex h-7 items-center gap-1.5 rounded-full bg-red-600 px-3 text-[11px] font-semibold text-white transition-all hover:bg-red-500 shadow-sm cursor-pointer active:scale-95"
              >
                <Radio size={12} className="animate-pulse" />
                <span>Start</span>
              </button>

              <button
                onClick={handleCancel}
                title="Close & Return to App"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </>
        )}

        {/* State 2: COUNTDOWN */}
        {status === 'countdown' && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-signal animate-pulse">
                {countdown}
              </span>
              <span className="font-mono text-[11px] text-white">Starting in {countdown}s…</span>
            </div>

            <div
              className="flex items-center gap-1.5 ml-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={handleCancel}
                title="Cancel"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </>
        )}

        {/* State 3: RECORDING OR PAUSED */}
        {(status === 'recording' || status === 'paused') && (
          <>
            {/* REC indicator */}
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                {!isPaused && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    isPaused ? 'bg-amber-400' : 'bg-red-500'
                  }`}
                />
              </span>
              <span className="font-mono text-[11px] font-semibold tracking-wider text-white uppercase">
                {isPaused ? 'PAUSED' : 'REC'}
              </span>
            </div>

            {/* Timer & progress bar */}
            <div className="flex flex-col gap-0.5 min-w-[76px]">
              <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums text-white/90">
                <span className="font-bold text-signal">{formattedSec}s</span>
                {isLimited && <span className="text-[10px] text-white/40">/ {maxSeconds}s</span>}
              </div>
              {isLimited ? (
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full transition-all duration-100 ${
                      percent > 80 ? 'bg-amber-400' : 'bg-signal'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : (
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-full bg-signal/60 animate-pulse" />
                </div>
              )}
            </div>

            {/* Controls */}
            <div
              className="flex items-center gap-1.5"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {/* Pause / Resume */}
              <button
                onClick={handleTogglePause}
                title={isPaused ? 'Resume' : 'Pause'}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
              >
                {isPaused ? <Play size={12} className="fill-current ml-0.5" /> : <Pause size={12} />}
              </button>

              {/* Stop & Convert */}
              <button
                onClick={handleStop}
                title="Stop & Convert to GIF"
                className="flex h-7 items-center gap-1 rounded-full bg-signal px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-signal/85 shadow-sm cursor-pointer"
              >
                <Square size={10} className="fill-current" />
                <span>Done</span>
              </button>

              {/* Cancel */}
              <button
                onClick={handleCancel}
                title="Cancel Recording"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </>
        )}

        {/* State 4: CONVERTING */}
        {status === 'converting' && (
          <div className="flex items-center gap-2 text-white">
            <Sparkles size={14} className="text-signal animate-spin" />
            <span className="font-mono text-[11px]">Converting to GIF…</span>
          </div>
        )}
      </div>
    </div>
  )
}
