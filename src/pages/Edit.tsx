/**
 * Edit.tsx — Video Editor page
 *
 * Trim tab: real video preview + draggable in/out handles on a visual timeline
 * Crop tab: live video preview with a drag-to-resize crop overlay
 */

import { useState, useRef, useEffect } from 'react'
import type { ReactNode, MouseEvent as RMouseEvent } from 'react'
import {
  Scissors, Crop, FileVideo, FolderSearch,
  CheckCircle2, AlertCircle, Play, Pause, Volume2, VolumeX,
} from 'lucide-react'
import { Page } from '../components/Page'
import { Button } from '../components/ui/Button'
import { useEditOp } from '../hooks/useEditOp'
import { useToolInputs } from '../state/inputs'
import { getVideoUrl } from '../lib/backend'
import { cn } from '../lib/utils'

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Convert local path to backend streaming URL */
function toVideoSrc(p: string): string {
  if (!p) return ''
  return getVideoUrl(p)
}

/** Seconds → mm:ss or h:mm:ss */
function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const h  = Math.floor(s / 3600)
  const m  = Math.floor((s % 3600) / 60)
  const sc = Math.floor(s % 60)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p2(m)}:${p2(sc)}` : `${p2(m)}:${p2(sc)}`
}

/** "hh:mm:ss", "mm:ss", or plain seconds → number. Null on bad input. */
function parseTime(s: string): number | null {
  const v = s.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v)
  const pts = v.split(':')
  if (pts.length < 2 || pts.length > 3) return null
  let secs = 0
  for (const p of pts) {
    if (!/^\d+(\.\d+)?$/.test(p.trim())) return null
    secs = secs * 60 + Number(p)
  }
  return secs
}

// ─── useVideo — video state wired through React event props ───────────────────

interface VState {
  duration: number
  currentTime: number
  playing: boolean
  muted: boolean
  vw: number
  vh: number
  loaded: boolean
}

const V0: VState = {
  duration: 0, currentTime: 0, playing: false,
  muted: false, vw: 1920, vh: 1080, loaded: false,
}

function useVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [s, set] = useState<VState>(V0)

  const onMeta = () => {
    const v = ref.current; if (!v) return
    set(p => ({
      ...p,
      duration: isFinite(v.duration) ? v.duration : 0,
      vw: v.videoWidth  || 1920,
      vh: v.videoHeight || 1080,
      loaded: true,
    }))
  }
  const onTime = () => {
    const v = ref.current; if (!v) return
    set(p => p.currentTime === v.currentTime ? p : { ...p, currentTime: v.currentTime })
  }
  const onPlay    = () => set(p => ({ ...p, playing: true  }))
  const onPause   = () => set(p => ({ ...p, playing: false }))
  const onEnded   = () => set(p => ({ ...p, playing: false }))
  const onVolume  = () => { const v = ref.current; if (v) set(p => ({ ...p, muted: v.muted })) }

  const handlers = {
    onLoadedMetadata: onMeta,
    onTimeUpdate:     onTime,
    onPlay, onPause, onEnded,
    onVolumeChange:   onVolume,
  }

  return { ref, s, handlers }
}

// ─── Shared result / progress panel ──────────────────────────────────────────

function ResultPanel({
  state, onReset, label,
}: {
  state: ReturnType<typeof useEditOp>['state']
  onReset: () => void
  label: string
}) {
  if (state.status === 'idle') return null

  if (state.status === 'done') {
    return (
      <div className="panel animate-lift-in space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">{label}</span>
          <span className="flex items-center gap-1.5 font-mono text-data text-ok">
            <CheckCircle2 size={12} /> Saved
          </span>
        </div>
        <p className="break-all font-mono text-data leading-relaxed text-ink-dim">{state.outputPath}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => state.outputPath && window.bench.revealFile(state.outputPath)}>
            <FolderSearch size={12} /> Show file
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>Edit another</Button>
        </div>
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className="panel animate-lift-in space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">{label}</span>
          <span className="flex items-center gap-1.5 font-mono text-data text-bad">
            <AlertCircle size={12} /> Failed
          </span>
        </div>
        <p className="text-small leading-relaxed text-bad">{state.message}</p>
        <Button size="sm" onClick={onReset}>Try again</Button>
      </div>
    )
  }

  // Running
  return (
    <div className="panel animate-lift-in space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-data tabular-nums text-signal">
          {state.percent.toFixed(0)}%
        </span>
      </div>
      <div className="relative h-1 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-300"
          style={{ width: `${state.percent}%` }}
        />
        {state.percent < 2 && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="h-full w-1/3 animate-sweep rounded-full bg-signal/40" />
          </div>
        )}
      </div>
      <p className="font-mono text-data text-ink-faint">{state.message}</p>
    </div>
  )
}

// ─── Trim tab ─────────────────────────────────────────────────────────────────

function TrimTab() {
  const { values, set, clear } = useToolInputs('edit-trim')
  const { path, start, end } = values
  const op = useEditOp('edit')
  const { ref: vRef, s: vs, handlers } = useVideo()
  const tlRef = useRef<HTMLDivElement>(null) // timeline bar

  // Keep latest computed values in a ref so drag handlers never see stale data.
  const startSec = parseTime(start) ?? 0
  const endSec   = (end && parseTime(end) != null) ? parseTime(end)! : vs.duration
  const live = useRef({ startSec: 0, endSec: 0, duration: 0 })
  live.current = { startSec, endSec, duration: vs.duration }

  // Keep `set` in a ref so the drag effect (empty deps) always calls the latest.
  const setRef = useRef(set)
  useEffect(() => { setRef.current = set })

  const dragTarget = useRef<'start' | 'end' | 'scrub' | null>(null)
  const busy    = op.state.status === 'running'
  const canRun  = Boolean(path?.trim()) && vs.duration > 0 && endSec > startSec

  const choose = async () => {
    const f = await window.bench.selectFile()
    if (!f) return
    set({ path: f, start: '00:00:00', end: '' })
    op.reset()
  }

  const reset = () => { clear(); op.reset() }

  const run = () => {
    if (!canRun) return
    op.runTrim({ file_path: path, start_time: fmt(startSec), end_time: fmt(endSec) })
  }

  const togglePlay = () => { const v = vRef.current; if (v) v.paused ? v.play() : v.pause() }
  const toggleMute = () => { const v = vRef.current; if (v) v.muted = !v.muted }

  /** Convert client X to a timeline timestamp. */
  const timeFromX = (clientX: number): number => {
    const bar = tlRef.current; if (!bar || !live.current.duration) return 0
    const r = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * live.current.duration
  }

  // One global handler, registered once.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dt = dragTarget.current; if (!dt) return
      const t = timeFromX(e.clientX)
      const { startSec: ss, endSec: es, duration: d } = live.current
      const v = vRef.current

      if (dt === 'scrub') {
        if (v) v.currentTime = t
      } else if (dt === 'start') {
        const c = Math.max(0, Math.min(es - 0.1, t))
        setRef.current({ start: fmt(c) })
        if (v) v.currentTime = c
      } else {
        const c = Math.max(ss + 0.1, Math.min(d, t))
        setRef.current({ end: fmt(c) })
        if (v) v.currentTime = c
      }
    }
    const onUp = () => { dragTarget.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, []) // stable — all mutable access goes through refs

  // Fractions for rendering (clamped to [0,1])
  const dur = vs.duration || 1
  const sf  = Math.max(0, Math.min(1, startSec / dur))
  const ef  = Math.max(0, Math.min(1, endSec   / dur))
  const pf  = Math.max(0, Math.min(1, vs.currentTime / dur))

  return (
    <div className="space-y-5">
      {/* File picker */}
      <div className="flex gap-2">
        <div className="field flex flex-1 items-center overflow-hidden">
          <span className={cn('truncate', !path && 'text-ink-faint')}>
            {path || 'No file chosen'}
          </span>
        </div>
        <Button variant="primary" onClick={choose} id="trim-choose-file">
          <FileVideo size={14} /> Choose file
        </Button>
      </div>

      {path ? (
        <div className="panel overflow-hidden">
          {/* ── Video preview ── */}
          <div
            className="relative flex items-center justify-center bg-black cursor-pointer"
            style={{ maxHeight: 320, minHeight: 120 }}
            onClick={togglePlay}
          >
            <video
              ref={vRef}
              src={toVideoSrc(path)}
              className="w-full object-contain"
              style={{ maxHeight: 320 }}
              playsInline
              {...handlers}
            />

            {/* Big play button shown when paused */}
            {!vs.playing && (
              <div className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm pointer-events-none">
                <Play size={22} fill="white" className="text-white ml-1" />
              </div>
            )}

            {/* Time readout */}
            <div className="absolute bottom-2 right-3 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[11px] text-white/80 tabular-nums pointer-events-none select-none">
              {fmt(vs.currentTime)} / {fmt(vs.duration)}
            </div>
          </div>

          {/* ── Timeline ── */}
          <div className="px-3 pt-3 pb-1 space-y-2">
            {/* The bar */}
            <div
              ref={tlRef}
              className="relative h-11 select-none rounded-md overflow-visible cursor-crosshair"
              style={{ background: 'var(--color-raised)' }}
              onMouseDown={(e) => {
                // Clicking the bar body (not a handle) scrubs
                if ((e.target as HTMLElement).closest('[data-handle]')) return
                dragTarget.current = 'scrub'
                const v = vRef.current
                if (v) v.currentTime = timeFromX(e.clientX)
              }}
            >
              {/* Excluded region – before in-point */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-md pointer-events-none"
                style={{ width: `${sf * 100}%`, background: 'rgba(0,0,0,0.65)' }}
              />

              {/* Selected region */}
              <div
                className="absolute inset-y-0 pointer-events-none"
                style={{
                  left: `${sf * 100}%`,
                  width: `${(ef - sf) * 100}%`,
                  background: 'rgba(232,163,61,0.12)',
                  borderTop:    '1px solid rgba(232,163,61,0.35)',
                  borderBottom: '1px solid rgba(232,163,61,0.35)',
                }}
              />

              {/* Excluded region – after out-point */}
              <div
                className="absolute inset-y-0 right-0 rounded-r-md pointer-events-none"
                style={{ width: `${(1 - ef) * 100}%`, background: 'rgba(0,0,0,0.65)' }}
              />

              {/* Playhead — the white scrub line */}
              <div
                className="absolute inset-y-0 w-px pointer-events-none"
                style={{
                  left: `${pf * 100}%`,
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 0 5px rgba(255,255,255,0.7)',
                }}
              >
                {/* Small triangle at top of playhead */}
                <div
                  className="absolute -top-0 -translate-x-1/2"
                  style={{
                    width: 0, height: 0,
                    borderLeft:   '5px solid transparent',
                    borderRight:  '5px solid transparent',
                    borderBottom: '7px solid rgba(255,255,255,0.85)',
                    transform: 'translateX(-50%) translateY(-100%)',
                  }}
                />
              </div>

              {/* ── Start (in-point) handle ── */}
              <div
                data-handle="start"
                className="absolute inset-y-0 flex cursor-ew-resize items-stretch"
                style={{ left: `${sf * 100}%`, transform: 'translateX(-100%)' }}
                onMouseDown={(e) => { e.stopPropagation(); dragTarget.current = 'start' }}
              >
                {/* Grip bar */}
                <div
                  className="relative flex h-full w-3.5 flex-col items-center justify-center gap-1 rounded-l-sm"
                  style={{ background: 'var(--color-signal)' }}
                >
                  <div className="h-3 w-0.5 rounded-full" style={{ background: 'rgba(26,18,6,0.5)' }} />
                  <div className="h-3 w-0.5 rounded-full" style={{ background: 'rgba(26,18,6,0.5)' }} />
                  {/* Time tooltip above handle */}
                  <div
                    className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 py-0.5 font-mono text-[9px]"
                    style={{ background: 'rgba(0,0,0,0.8)', color: 'var(--color-signal)' }}
                  >
                    {fmt(startSec)}
                  </div>
                </div>
              </div>

              {/* ── End (out-point) handle ── */}
              <div
                data-handle="end"
                className="absolute inset-y-0 flex cursor-ew-resize items-stretch"
                style={{ left: `${ef * 100}%` }}
                onMouseDown={(e) => { e.stopPropagation(); dragTarget.current = 'end' }}
              >
                <div
                  className="relative flex h-full w-3.5 flex-col items-center justify-center gap-1 rounded-r-sm"
                  style={{ background: 'var(--color-signal)' }}
                >
                  <div className="h-3 w-0.5 rounded-full" style={{ background: 'rgba(26,18,6,0.5)' }} />
                  <div className="h-3 w-0.5 rounded-full" style={{ background: 'rgba(26,18,6,0.5)' }} />
                  <div
                    className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 py-0.5 font-mono text-[9px]"
                    style={{ background: 'rgba(0,0,0,0.8)', color: 'var(--color-signal)' }}
                  >
                    {fmt(endSec)}
                  </div>
                </div>
              </div>
            </div>

            {/* Labels below timeline */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tabular-nums text-ink-faint">{fmt(startSec)}</span>
              <span className="font-mono text-[11px] tabular-nums font-medium" style={{ color: 'var(--color-signal)' }}>
                {endSec > startSec ? `${fmt(endSec - startSec)} selected` : '—'}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-ink-faint">{fmt(endSec)}</span>
            </div>
          </div>

          {/* ── Controls bar ── */}
          <div className="flex items-center justify-between border-t border-line px-3 py-2.5 mt-1">
            <div className="flex items-center gap-1.5">
              <button
                onClick={togglePlay}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-raised text-ink hover:bg-overlay transition-colors"
              >
                {vs.playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={toggleMute}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-dim hover:bg-raised hover:text-ink transition-colors"
              >
                {vs.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <span className="ml-1 font-mono text-[11px] tabular-nums text-ink-faint">
                {fmt(vs.currentTime)} / {fmt(vs.duration)}
              </span>
            </div>

            <div className="flex gap-2">
              {(path || start || end) && (
                <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>
              )}
              <Button
                variant="primary"
                onClick={run}
                disabled={!canRun || busy}
                id="trim-run-button"
              >
                <Scissors size={14} />
                {busy ? 'Trimming…' : 'Trim video'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty-state hint */
        <div className="panel flex items-start gap-3 p-4">
          <Scissors size={15} className="mt-0.5 shrink-0 text-ink-faint" />
          <p className="text-small leading-relaxed text-ink-dim">
            Choose a local video file. The video will appear with a timeline below it.
            Drag the <span className="font-medium" style={{ color: 'var(--color-signal)' }}>amber handles</span> to
            set the in and out points, or click anywhere on the timeline to scrub.
          </p>
        </div>
      )}

      <ResultPanel state={op.state} onReset={op.reset} label="Trimmed video" />
    </div>
  )
}

// ─── Crop tab ─────────────────────────────────────────────────────────────────

type CH = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'
const CH_CUR: Record<CH, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e:  'e-resize',  se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w:  'w-resize',  move: 'move',
}

function CropTab() {
  const { values, set, clear } = useToolInputs('edit-crop')
  const { path, x = '0', y = '0', width = '', height = '' } = values
  const op = useEditOp('edit')
  const { ref: vRef, s: vs, handlers } = useVideo()
  const cRef = useRef<HTMLDivElement>(null) // crop container

  const setRef = useRef(set)
  useEffect(() => { setRef.current = set })

  const xn = Math.max(0, parseInt(x)      || 0)
  const yn = Math.max(0, parseInt(y)      || 0)
  const wn = parseInt(width)  || 0
  const hn = parseInt(height) || 0

  const busy    = op.state.status === 'running'
  const valid   = wn > 0 && hn > 0
  const canRun  = Boolean(path?.trim()) && valid

  // When video loads and no crop is set, default to the full frame.
  const initDone = useRef(false)
  useEffect(() => { initDone.current = false }, [path])
  useEffect(() => {
    if (vs.vw > 0 && vs.vh > 0 && !initDone.current) {
      initDone.current = true
      if (!wn) setRef.current({ width: String(vs.vw) })
      if (!hn) setRef.current({ height: String(vs.vh) })
    }
  }, [vs.vw, vs.vh, wn, hn])

  const choose = async () => {
    const f = await window.bench.selectFile(); if (!f) return
    set({ path: f, x: '0', y: '0', width: '', height: '' })
    op.reset()
  }
  const reset = () => { clear(); op.reset() }
  const run   = () => {
    if (!canRun) return
    op.runCrop({ file_path: path, x: xn, y: yn, width: wn, height: hn })
  }

  // ── Crop drag ──────────────────────────────────────────────────────────────

  const drag = useRef<{
    h: CH
    mx0: number; my0: number
    r0: { x: number; y: number; w: number; h: number }
    sx: number;  sy: number
  } | null>(null)

  // Live video dimensions for the drag handler
  const liveVid = useRef({ vw: 1920, vh: 1080 })
  liveVid.current = { vw: vs.vw, vh: vs.vh }

  const startDrag = (h: CH) => (e: RMouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const c = cRef.current; if (!c) return
    const cr = c.getBoundingClientRect()
    // Scale against actual displayed video dimensions inside letterbox
    const containerAspect = cr.width / cr.height
    const videoAspect = (vs.vw || 1920) / (vs.vh || 1080)
    let renderedW = cr.width, renderedH = cr.height
    if (videoAspect > containerAspect) {
      renderedH = cr.width / videoAspect
    } else {
      renderedW = cr.height * videoAspect
    }

    drag.current = {
      h,
      mx0: e.clientX, my0: e.clientY,
      r0: { x: xn, y: yn, w: wn || vs.vw, h: hn || vs.vh },
      sx: (vs.vw || 1920) / renderedW,
      sy: (vs.vh || 1080) / renderedH,
    }
  }

  useEffect(() => {
    const MIN = 10
    const onMove = (e: MouseEvent) => {
      const d = drag.current; if (!d) return
      const dx = (e.clientX - d.mx0) * d.sx
      const dy = (e.clientY - d.my0) * d.sy
      const { h, r0: r } = d
      const { vw, vh } = liveVid.current
      let nx = r.x, ny = r.y, nw = r.w, nh = r.h

      if (h === 'move') {
        nx = Math.max(0, Math.min(vw - nw, r.x + dx))
        ny = Math.max(0, Math.min(vh - nh, r.y + dy))
      }
      if (h === 'e'  || h === 'ne' || h === 'se') nw = Math.max(MIN, Math.min(vw - r.x, r.w + dx))
      if (h === 'w'  || h === 'nw' || h === 'sw') {
        const x2 = Math.max(0, Math.min(r.x + r.w - MIN, r.x + dx))
        nw = r.x + r.w - x2; nx = x2
      }
      if (h === 's'  || h === 'se' || h === 'sw') nh = Math.max(MIN, Math.min(vh - r.y, r.h + dy))
      if (h === 'n'  || h === 'nw' || h === 'ne') {
        const y2 = Math.max(0, Math.min(r.y + r.h - MIN, r.y + dy))
        nh = r.y + r.h - y2; ny = y2
      }

      setRef.current({
        x: String(Math.round(nx)), y: String(Math.round(ny)),
        width: String(Math.round(nw)), height: String(Math.round(nh)),
      })
    }
    const onUp = () => { drag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, []) // stable — mutable access through refs

  // Overlay fractions (0–1)
  const vw = vs.vw || 1, vh = vs.vh || 1
  const dw = wn || vw, dh = hn || vh
  const fl = Math.max(0, xn  / vw)
  const ft = Math.max(0, yn  / vh)
  const fw = Math.min(1, dw  / vw)
  const fh = Math.min(1, dh  / vh)

  const HANDLES: { h: CH; l: number; t: number }[] = [
    { h: 'nw', l: fl,          t: ft          },
    { h: 'n',  l: fl + fw / 2, t: ft          },
    { h: 'ne', l: fl + fw,     t: ft          },
    { h: 'e',  l: fl + fw,     t: ft + fh / 2 },
    { h: 'se', l: fl + fw,     t: ft + fh     },
    { h: 's',  l: fl + fw / 2, t: ft + fh     },
    { h: 'sw', l: fl,          t: ft + fh     },
    { h: 'w',  l: fl,          t: ft + fh / 2 },
  ]

  // Calculate actual displayed video box inside container (accounting for object-contain letterboxing)
  let boxLeft = 0, boxTop = 0, boxW = 1, boxH = 1
  if (cRef.current && vs.vw > 0 && vs.vh > 0) {
    const cr = cRef.current.getBoundingClientRect()
    const containerAspect = cr.width / cr.height
    const videoAspect = vs.vw / vs.vh
    if (videoAspect > containerAspect) {
      boxW = cr.width
      boxH = cr.width / videoAspect
      boxLeft = 0
      boxTop = (cr.height - boxH) / 2
    } else {
      boxH = cr.height
      boxW = cr.height * videoAspect
      boxTop = 0
      boxLeft = (cr.width - boxW) / 2
    }
  }

  return (
    <div className="space-y-5">
      {/* File picker */}
      <div className="flex gap-2">
        <div className="field flex flex-1 items-center overflow-hidden">
          <span className={cn('truncate', !path && 'text-ink-faint')}>
            {path || 'No file chosen'}
          </span>
        </div>
        <Button variant="primary" onClick={choose} id="crop-choose-file">
          <FileVideo size={14} /> Choose file
        </Button>
      </div>

      {path ? (
        <div className="panel overflow-hidden">
          {/* Video with crop overlay */}
          <div className="bg-black">
            <div
              ref={cRef}
              className="relative flex h-80 w-full items-center justify-center overflow-hidden bg-black select-none"
            >
              {/* The actual video — preserves natural aspect ratio without stretching */}
              <video
                ref={vRef}
                src={toVideoSrc(path)}
                className="h-full w-full object-contain pointer-events-none"
                autoPlay loop muted playsInline
                {...handlers}
              />

              {/* Crop box overlay positioned precisely on top of the displayed video frame */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: boxLeft,
                  top: boxTop,
                  width: boxW,
                  height: boxH,
                }}
              >
                {/* ── Dark mask around the crop rect (4 rectangles) ── */}
                {/* Top */}
                <div
                  className="absolute left-0 right-0 top-0 pointer-events-none"
                  style={{ height: `${ft * 100}%`, background: 'rgba(0,0,0,0.65)' }}
                />
                {/* Bottom */}
                <div
                  className="absolute left-0 right-0 bottom-0 pointer-events-none"
                  style={{ height: `${(1 - ft - fh) * 100}%`, background: 'rgba(0,0,0,0.65)' }}
                />
                {/* Left */}
                <div
                  className="absolute left-0 pointer-events-none"
                  style={{
                    top: `${ft * 100}%`, width: `${fl * 100}%`, height: `${fh * 100}%`,
                    background: 'rgba(0,0,0,0.65)',
                  }}
                />
                {/* Right */}
                <div
                  className="absolute right-0 pointer-events-none"
                  style={{
                    top: `${ft * 100}%`, width: `${(1 - fl - fw) * 100}%`, height: `${fh * 100}%`,
                    background: 'rgba(0,0,0,0.65)',
                  }}
                />

                {/* ── Crop rectangle border + move handle ── */}
                <div
                  className="absolute cursor-move pointer-events-auto"
                  style={{
                    left: `${fl * 100}%`, top: `${ft * 100}%`,
                    width: `${fw * 100}%`, height: `${fh * 100}%`,
                    border: '2px solid var(--color-signal)',
                    boxShadow: '0 0 0 1px rgba(232,163,61,0.25)',
                  }}
                  onMouseDown={startDrag('move')}
                >
                  {/* Rule-of-thirds grid (subtle) */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <div className="absolute top-2/3 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <div className="absolute left-1/3 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <div className="absolute left-2/3 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                  </div>

                  {/* Dimension badge */}
                  <div
                    className="absolute bottom-1.5 right-1.5 pointer-events-none select-none rounded px-1.5 py-0.5 font-mono text-[10px]"
                    style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--color-signal)' }}
                  >
                    {Math.round(dw)}×{Math.round(dh)}
                  </div>
                </div>

                {/* ── Resize handles ── */}
                {HANDLES.map(({ h, l, t }) => (
                  <div
                    key={h}
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                    style={{ left: `${l * 100}%`, top: `${t * 100}%`, cursor: CH_CUR[h] }}
                    onMouseDown={startDrag(h)}
                  >
                    <div
                      className="h-3.5 w-3.5 rounded-sm transition-colors"
                      style={{
                        border: '2px solid var(--color-signal)',
                        background: 'var(--color-bg)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Numeric inputs ── */}
          <div className="grid grid-cols-4 gap-3 p-4">
            {([
              { id: 'crop-x', label: 'X',      val: x,      fn: (v: string) => set({ x: v })      },
              { id: 'crop-y', label: 'Y',      val: y,      fn: (v: string) => set({ y: v })      },
              { id: 'crop-w', label: 'Width',  val: width,  fn: (v: string) => set({ width: v })  },
              { id: 'crop-h', label: 'Height', val: height, fn: (v: string) => set({ height: v }) },
            ] as const).map(({ id, label, val, fn }) => (
              <div key={id} className="space-y-1.5">
                <label htmlFor={id} className="label">{label}</label>
                <input
                  id={id}
                  type="number"
                  min={0}
                  className="field text-center"
                  value={val}
                  onChange={(e) => fn(e.target.value)}
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          {/* Actions bar */}
          <div className="flex items-center justify-between border-t border-line px-4 pb-4 pt-3">
            <p className="font-mono text-[11px] text-ink-faint">
              {valid
                ? `${wn}×${hn} at (${xn}, ${yn})`
                : 'Drag handles to define the crop area'}
            </p>
            <div className="flex gap-2">
              {(path || width || height) && (
                <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>
              )}
              <Button
                variant="primary"
                onClick={run}
                disabled={!canRun || busy}
                id="crop-run-button"
              >
                <Crop size={14} />
                {busy ? 'Cropping…' : 'Crop video'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel flex items-start gap-3 p-4">
          <Crop size={15} className="mt-0.5 shrink-0 text-ink-faint" />
          <p className="text-small leading-relaxed text-ink-dim">
            Choose a video file. The preview will show a live loop with an interactive crop
            overlay. Drag the <span className="font-medium" style={{ color: 'var(--color-signal)' }}>amber handles</span> to
            resize the region, or drag inside the rectangle to move it.
          </p>
        </div>
      )}

      <ResultPanel state={op.state} onReset={op.reset} label="Cropped video" />
    </div>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

type Tab = 'trim' | 'crop'

function TabBtn({
  id, active, icon, label, onClick,
}: {
  id: string; active: boolean; icon: ReactNode; label: string; onClick: () => void
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-body transition-colors duration-150',
        active
          ? 'bg-raised font-medium text-ink shadow-sm'
          : 'text-ink-dim hover:bg-raised/50 hover:text-ink',
      )}
    >
      <span className={active ? 'text-signal' : 'text-ink-faint'}>{icon}</span>
      {label}
    </button>
  )
}

export function Edit() {
  const [tab, setTab] = useState<Tab>('trim')

  return (
    <Page
      scope="edit"
      title="Video Editor"
      description="Trim on a visual timeline with drag handles, or drag to define a crop region."
    >
      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-lg border border-line bg-surface p-1">
        <TabBtn
          id="edit-tab-trim"
          active={tab === 'trim'}
          icon={<Scissors size={14} />}
          label="Trim"
          onClick={() => setTab('trim')}
        />
        <TabBtn
          id="edit-tab-crop"
          active={tab === 'crop'}
          icon={<Crop size={14} />}
          label="Crop"
          onClick={() => setTab('crop')}
        />
      </div>

      {tab === 'trim' ? <TrimTab /> : <CropTab />}
    </Page>
  )
}
