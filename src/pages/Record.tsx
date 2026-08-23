import { useEffect, useState, useCallback } from 'react'
import {
  Radio,
  FolderSearch,
  Clock,
  Monitor,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Film,
  Video,
  ZoomIn,
  Sliders,
} from 'lucide-react'
import { Page } from '../components/Page'
import { Button } from '../components/ui/Button'
import { ZoomStudioModal } from '../components/ZoomStudioModal'
import { type BezierCurve, resolveCurveName } from '../components/CubicBezierEditor'
import { useScreenRecorder } from '../hooks/useScreenRecorder'
import { useToolInputs } from '../state/inputs'
import { cn } from '../lib/utils'
import type { ScreenSource } from '../../electron/preload'

const FPS_CHOICES = [15, 24, 30, 60]
const WIDTH_CHOICES = [480, 640, 800, 1080, 0]

export function Record() {
  const { values, set, clear } = useToolInputs('record')
  const {
    sourceId,
    fps,
    width,
    countdown: enableCountdown,
    limitDuration = true,
    highQuality = true,
    format = 'gif',
    zoomEnabled = true,
    zoomFactor = 2.0,
    zoomKey = 'ctrl',
    zoomSpeed = 0.12,
    zoomRadius = 16,
    zoomBezier = [0.22, 1.0, 0.36, 1.0],
    zoomTriggerMode = 'hold',
  } = values

  const setSourceId = (v: string) => set({ sourceId: v })
  const setFps = (v: number) => set({ fps: v })
  const setWidth = (v: number) => set({ width: v })
  const setCountdown = (v: boolean) => set({ countdown: v })
  const setLimitDuration = (v: boolean) => set({ limitDuration: v })
  const setHighQuality = (v: boolean) => set({ highQuality: v })
  const setFormat = (v: 'gif' | 'video') => set({ format: v })
  const setZoomEnabled = (v: boolean) => set({ zoomEnabled: v })
  const setZoomFactor = (v: number) => set({ zoomFactor: v })
  const setZoomKey = (v: string) => set({ zoomKey: v })
  const setZoomSpeed = (v: number) => set({ zoomSpeed: v })
  const setZoomRadius = (v: number) => set({ zoomRadius: v })
  const setZoomBezier = (v: BezierCurve) => set({ zoomBezier: v })
  const setZoomTriggerMode = (v: 'hold' | 'toggle') => set({ zoomTriggerMode: v })

  const [isStudioOpen, setIsStudioOpen] = useState(false)
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [loadingSources, setLoadingSources] = useState(false)

  const recorder = useScreenRecorder()
  const { state } = recorder

  const refreshSources = useCallback(async () => {
    setLoadingSources(true)
    try {
      const list = await window.bench?.getScreenSources()
      if (list && list.length > 0) {
        setSources(list)
        if (!sourceId || !list.some((s) => s.id === sourceId)) {
          set({ sourceId: list[0].id })
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingSources(false)
    }
  }, [sourceId, set])

  useEffect(() => {
    let active = true
    window.bench
      ?.getScreenSources()
      .then((list) => {
        if (active && list && list.length > 0) {
          setSources(list)
          if (!sourceId || !list.some((s) => s.id === sourceId)) {
            set({ sourceId: list[0].id })
          }
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
    // Run only once on mount to prevent infinite loop of desktop captures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenWidget = () => {
    recorder.openWidget({
      sourceId,
      fps,
      width,
      countdown: enableCountdown,
      limitDuration,
      highQuality,
      format,
      zoomEnabled,
      zoomFactor,
      zoomKey,
      zoomSpeed,
      zoomRadius,
      zoomBezier,
      zoomTriggerMode,
    })
  }

  const handleReset = () => {
    clear()
    recorder.reset()
  }

  return (
    <Page
      onClear={handleReset}
      canClear={state.status !== 'idle'}
      scope="record"
      title="Screen Recorder"
      description="Capture high-definition screen video or GIFs with smooth real-time cursor zoom."
    >
      <div className="space-y-6">
        {/* Output Format Switcher */}
        <div className="panel p-4 space-y-3">
          <span className="label">Recording Output Format</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFormat('gif')}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150',
                format === 'gif'
                  ? 'border-signal bg-signal/10 shadow-sm'
                  : 'border-line hover:border-line-strong hover:bg-raised/40',
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                  format === 'gif'
                    ? 'border-signal bg-signal text-white'
                    : 'border-line bg-raised text-ink-dim',
                )}
              >
                <Film size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-small text-ink">Animated GIF</p>
                <p className="text-[11px] text-ink-faint">Optimized 256-color palette for sharing</p>
              </div>
            </button>

            <button
              onClick={() => setFormat('video')}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150',
                format === 'video'
                  ? 'border-signal bg-signal/10 shadow-sm'
                  : 'border-line hover:border-line-strong hover:bg-raised/40',
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                  format === 'video'
                    ? 'border-signal bg-signal text-white'
                    : 'border-line bg-raised text-ink-dim',
                )}
              >
                <Video size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-small text-ink">MP4 Video</p>
                <p className="text-[11px] text-ink-faint">H.264 pristine quality, full color & 60fps</p>
              </div>
            </button>
          </div>
        </div>

        {/* Source Selector */}
        <div className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5">
              <Monitor size={14} className="text-signal" /> Recording Source
            </span>
            <button
              onClick={refreshSources}
              title="Refresh screens"
              className="text-ink-faint hover:text-ink transition-colors p-1 rounded"
            >
              <RefreshCw size={12} className={cn(loadingSources && 'animate-spin')} />
            </button>
          </div>

          {sources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {sources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => setSourceId(src.id)}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all duration-150',
                    sourceId === src.id || (!sourceId && src === sources[0])
                      ? 'border-signal bg-signal/10 shadow-sm'
                      : 'border-line hover:border-line-strong hover:bg-raised/40',
                  )}
                >
                  {src.thumbnail ? (
                    <img
                      src={src.thumbnail}
                      alt={src.name}
                      className="h-12 w-20 shrink-0 rounded object-cover border border-line bg-black/40"
                    />
                  ) : (
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-line bg-raised">
                      <Monitor size={18} className="text-ink-dim" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-small text-ink">{src.name}</p>
                    <span className="text-[11px] text-ink-faint">Full Display</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-small text-ink-dim py-2">
              <Monitor size={16} className="text-ink-faint" />
              <span>Primary Screen (Entire Display)</span>
            </div>
          )}
        </div>

        {/* Smooth Cursor Zoom Feature Section */}
        <div className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-signal/10 text-signal">
                <ZoomIn size={17} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="label">Smooth Cursor Zoom</span>
                  <span className="rounded bg-signal/15 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-signal">
                    Camera Pan
                  </span>
                </div>
                <p className="text-small text-ink-dim">
                  Hold a hotkey while recording to zoom into your mouse cursor
                </p>
              </div>
            </div>
            <button
              onClick={() => setZoomEnabled(!zoomEnabled)}
              aria-pressed={zoomEnabled}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                zoomEnabled ? 'bg-signal' : 'bg-line-strong',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  zoomEnabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {zoomEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-raised/40 border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
                <span className="rounded bg-signal/10 text-signal font-mono font-semibold px-2 py-0.5 border border-signal/25">
                  [{zoomKey.toUpperCase()}] Hold to Zoom
                </span>
                <span className="text-ink-faint">·</span>
                <span className="font-mono font-semibold text-ink">{zoomFactor.toFixed(1)}x Magnification</span>
                <span className="text-ink-faint">·</span>
                <span className="font-mono text-ink-dim">{zoomRadius}px Radius</span>
                <span className="text-ink-faint">·</span>
                <span className="text-sky-400 font-semibold">
                  {resolveCurveName(zoomBezier)}
                </span>
              </div>

              <Button
                onClick={() => setIsStudioOpen(true)}
                className="flex items-center gap-1.5 bg-signal/10 hover:bg-signal/20 text-signal border border-signal/30 text-small py-1.5 px-3 cursor-pointer"
              >
                <Sliders size={13} />
                <span>Configure & Preview Studio</span>
                <Sparkles size={12} className="text-signal" />
              </Button>
            </div>
          )}
        </div>

        {/* Dedicated 2-Column Zoom Studio Modal */}
        <ZoomStudioModal
          isOpen={isStudioOpen}
          onClose={() => setIsStudioOpen(false)}
          initialValues={{
            zoomKey,
            zoomFactor,
            zoomSpeed,
            zoomRadius,
            zoomBezier,
            zoomTriggerMode,
          }}
          onSave={(newValues) => {
            setZoomKey(newValues.zoomKey)
            setZoomFactor(newValues.zoomFactor)
            setZoomSpeed(newValues.zoomSpeed)
            setZoomRadius(newValues.zoomRadius)
            setZoomBezier(newValues.zoomBezier)
            setZoomTriggerMode(newValues.zoomTriggerMode)
          }}
        />

        {/* Video & Encoding Settings */}
        <div className="panel space-y-4 p-4">
          <ChoiceRow
            label="Frame rate"
            hint={fps === 60 ? 'Ultra smooth 60 fps' : 'Higher is smoother'}
            options={FPS_CHOICES}
            value={fps}
            onChange={setFps}
            format={(v) => `${v} fps`}
          />
          <div className="h-px bg-line" />
          <ChoiceRow
            label="Resolution Width"
            hint="Native preserves full resolution"
            options={WIDTH_CHOICES}
            value={width}
            onChange={setWidth}
            format={(v) => (v === 0 ? 'Native' : `${v} px`)}
          />
          <div className="h-px bg-line" />

          {/* High Quality Palette Mode (Only for GIF) */}
          {format === 'gif' && (
            <>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="label">High Quality Palette Mode</span>
                    <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal">
                      Crisp
                    </span>
                  </div>
                  <p className="text-small text-ink-dim">
                    {highQuality !== false
                      ? 'Full 256-color palette with Floyd-Steinberg diffusion for smooth gradients'
                      : 'Fast standard palette (smaller file size)'}
                  </p>
                </div>
                <button
                  onClick={() => setHighQuality(highQuality === false)}
                  aria-pressed={highQuality !== false}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                    highQuality !== false ? 'bg-signal' : 'bg-line-strong',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                      highQuality !== false ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              <div className="h-px bg-line" />
            </>
          )}

          {/* Countdown settings */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="label">3-Second Countdown</span>
              <p className="text-small text-ink-dim">Count down after clicking Start in the widget</p>
            </div>
            <button
              onClick={() => setCountdown(!enableCountdown)}
              aria-pressed={enableCountdown}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                enableCountdown ? 'bg-signal' : 'bg-line-strong',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  enableCountdown ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          <div className="h-px bg-line" />

          {/* 10-Second Limit Toggle */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="label">10-Second Auto-Stop Limit</span>
              <p className="text-small text-ink-dim">
                {limitDuration !== false
                  ? 'Auto-stops at 10 seconds'
                  : 'No time limit (record continuously until you click Done)'}
              </p>
            </div>
            <button
              onClick={() => setLimitDuration(limitDuration === false)}
              aria-pressed={limitDuration !== false}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                limitDuration !== false ? 'bg-signal' : 'bg-line-strong',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  limitDuration !== false ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {limitDuration !== false ? (
            <div className="flex items-center gap-2 rounded-md bg-signal/5 border border-signal/15 px-3 py-2 text-small text-ink-dim">
              <Clock size={14} className="text-signal shrink-0" />
              <span>
                <strong className="text-ink font-semibold">10-second limit enabled:</strong> Recording stops automatically at 10s.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-small text-amber-200">
              <Clock size={14} className="text-amber-400 shrink-0" />
              <span>
                <strong className="text-white font-semibold">Unlimited Mode:</strong> Click <strong>Done</strong> on the widget when you want to finish and convert.
              </span>
            </div>
          )}
        </div>

        {/* Action Button / Active State */}
        {state.status === 'idle' && (
          <Button
            variant="primary"
            size="lg"
            className="w-full justify-center gap-2 py-3 text-base shadow-md hover:shadow-lg transition-all"
            onClick={handleOpenWidget}
          >
            <Radio size={16} className="text-white" />
            Launch Screen Recorder Widget
          </Button>
        )}

        {state.status === 'ready' && (
          <div className="panel flex flex-col items-center justify-center p-6 space-y-2.5 text-center border-signal/30 bg-signal/5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-signal" />
              </span>
              <span className="font-medium text-body text-ink">Floating Recorder is Open at Top-Left</span>
            </div>
            <p className="text-small text-ink-dim">
              Click <strong className="text-signal font-semibold">Start</strong> on the floating widget (or drag it anywhere on your screen).
            </p>
            <div className="pt-2">
              <Button size="sm" variant="ghost" onClick={recorder.cancel}>
                Close Widget
              </Button>
            </div>
          </div>
        )}

        {state.status === 'countdown' && (
          <div className="panel flex flex-col items-center justify-center p-8 space-y-3 text-center border-signal/30 bg-signal/5 animate-pulse">
            <span className="font-mono text-4xl font-bold text-signal">{state.countdown}</span>
            <p className="text-body font-medium text-ink">Starting recording…</p>
            <p className="text-small text-ink-dim">Recording starting on the floating widget.</p>
          </div>
        )}

        {(state.status === 'recording' || state.status === 'paused') && (
          <div className="panel space-y-3 p-5 border-signal/40 bg-signal/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="font-medium text-body text-ink">
                  {state.status === 'paused' ? 'Recording Paused' : 'Recording in Progress…'}
                </span>
              </div>
              <span className="font-mono text-signal font-semibold tabular-nums">
                {state.seconds.toFixed(1)}s {state.maxSeconds > 0 ? `/ ${state.maxSeconds}s` : ''}
              </span>
            </div>
            <p className="text-small text-ink-dim">
              Use the floating widget to Pause, Resume, or Stop & Save.
              {zoomEnabled && ` Hold [${zoomKey.toUpperCase()}] to zoom into cursor.`}
            </p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="primary" onClick={recorder.stop}>
                Stop & Save Now
              </Button>
              <Button size="sm" variant="ghost" onClick={recorder.cancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Converting Status */}
        {state.status === 'converting' && (
          <div className="panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-signal animate-spin" />
                <span className="font-medium text-body text-ink">
                  {format === 'video' ? 'Encoding MP4 Video…' : 'Generating Animated GIF…'}
                </span>
              </div>
              <span className="font-mono text-data tabular-nums text-signal font-bold">
                {state.gifState.percent.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-signal transition-all duration-200"
                style={{ width: `${Math.max(5, state.gifState.percent)}%` }}
              />
            </div>
            <p className="font-mono text-small text-ink-faint">{state.gifState.message}</p>
          </div>
        )}

        {/* Result Done Card */}
        {state.status === 'done' && state.outputPath && (
          <div className="panel space-y-4 p-5 border-signal/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-ok" />
                <span className="font-semibold text-body text-ink">
                  {format === 'video' ? 'MP4 Video Created Successfully!' : 'GIF Created Successfully!'}
                </span>
              </div>
              <span className="font-mono text-data text-ok">Saved</span>
            </div>

            {/* Preview Media */}
            <div className="overflow-hidden rounded-lg border border-line bg-black/40 p-2 flex items-center justify-center max-h-80">
              {format === 'video' ? (
                <video
                  src={`http://127.0.0.1:8000/api/stream_video?path=${encodeURIComponent(state.outputPath)}`}
                  controls
                  autoPlay
                  loop
                  muted
                  className="max-h-72 rounded object-contain"
                />
              ) : (
                <img
                  src={`http://127.0.0.1:8000/api/stream_video?path=${encodeURIComponent(state.outputPath)}`}
                  alt="Converted GIF preview"
                  className="max-h-72 rounded object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              )}
            </div>

            <p className="break-all font-mono text-small leading-relaxed text-ink-dim bg-raised/50 p-2.5 rounded-md border border-line">
              {state.outputPath}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => state.outputPath && window.bench?.revealFile(state.outputPath)}
              >
                <FolderSearch size={14} /> Show in Folder
              </Button>
              <Button size="sm" variant="ghost" onClick={recorder.reset}>
                Record Another
              </Button>
            </div>
          </div>
        )}

        {/* Failed Card */}
        {state.status === 'failed' && (
          <div className="panel space-y-3 p-5 border-bad/30">
            <div className="flex items-center justify-between">
              <span className="label text-bad">Recording / Conversion Failed</span>
            </div>
            <p className="text-small leading-relaxed text-bad">{state.error || state.gifState.message}</p>
            <Button size="sm" onClick={recorder.reset}>
              Try Again
            </Button>
          </div>
        )}
      </div>
    </Page>
  )
}

function ChoiceRow({
  label,
  hint,
  options,
  value,
  onChange,
  format,
}: {
  label: string
  hint: string
  options: number[]
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="label">{hint}</span>
      </div>
      <div className="flex gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn(
              'flex-1 rounded-md border py-1.5 font-mono text-small tabular-nums transition-colors duration-100',
              value === option
                ? 'border-signal bg-signal/10 text-signal font-semibold'
                : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
            )}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  )
}
