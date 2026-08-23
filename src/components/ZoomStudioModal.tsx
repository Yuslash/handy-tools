import { useState } from 'react'
import {
  ZoomIn,
  Keyboard,
  Maximize2,
  Check,
  X,
  Sparkles,
  RotateCcw,
  Layers,
  Gauge,
} from 'lucide-react'
import { Button } from './ui/Button'
import { ZoomPreviewBox } from './ZoomPreviewBox'
import {
  CubicBezierEditor,
  type BezierCurve,
  DEFAULT_BEZIER_PRESETS,
  resolveCurveName,
} from './CubicBezierEditor'
import { cn } from '../lib/utils'

const BROWSER_SAFE_KEYS = [
  { id: 'middle_mouse', label: '🖱️ Middle Mouse', hint: 'Scroll wheel press' },
  { id: 'tilde', label: '~ Tilde (`)', hint: 'Top left key' },
  { id: 'z', label: 'Z Key', hint: 'Left hand' },
  { id: 'c', label: 'C Key', hint: 'Left hand' },
  { id: 'x', label: 'X Key', hint: 'Left hand' },
  { id: 'capslock', label: 'Caps Lock', hint: 'Toggle safe' },
  { id: 'f2', label: 'F2 Key', hint: 'Top row' },
]

const MODIFIER_KEYS = [
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt' },
  { id: 'shift', label: 'Shift' },
  { id: 'space', label: 'Space' },
]

const ZOOM_PRESETS = [1.5, 2.0, 2.5, 3.0, 4.0]
const RADIUS_CHOICES = [0, 12, 24, 36, 48, 64]
const SPEED_PRESETS = [
  { val: 0.15, label: 'Instant (0.15s)' },
  { val: 0.25, label: 'Snappy (0.25s)' },
  { val: 0.45, label: 'Smooth (0.45s)' },
  { val: 0.75, label: 'Cinematic (0.75s)' },
  { val: 1.20, label: 'Slow (1.20s)' },
]

interface ZoomStudioModalProps {
  isOpen: boolean
  onClose: () => void
  initialValues: {
    zoomKey: string
    zoomFactor: number
    zoomSpeed: number
    zoomRadius: number
    zoomBezier: BezierCurve
    zoomTriggerMode?: 'hold' | 'toggle'
  }
  onSave: (values: {
    zoomKey: string
    zoomFactor: number
    zoomSpeed: number
    zoomRadius: number
    zoomBezier: BezierCurve
    zoomTriggerMode: 'hold' | 'toggle'
  }) => void
}

export function ZoomStudioModal({
  isOpen,
  onClose,
  initialValues,
  onSave,
}: ZoomStudioModalProps) {
  const [zoomKey, setZoomKey] = useState(initialValues.zoomKey)
  const [zoomFactor, setZoomFactor] = useState(initialValues.zoomFactor)
  const [zoomSpeed, setZoomSpeed] = useState(initialValues.zoomSpeed)
  const [zoomRadius, setZoomRadius] = useState(initialValues.zoomRadius)
  const [zoomBezier, setZoomBezier] = useState<BezierCurve>(initialValues.zoomBezier)
  const [zoomTriggerMode, setZoomTriggerMode] = useState<'hold' | 'toggle'>(
    initialValues.zoomTriggerMode || 'hold',
  )

  if (!isOpen) return null

  const handleSave = () => {
    onSave({
      zoomKey,
      zoomFactor,
      zoomSpeed,
      zoomRadius,
      zoomBezier,
      zoomTriggerMode,
    })
    onClose()
  }

  const handleReset = () => {
    setZoomKey('ctrl')
    setZoomFactor(2.0)
    setZoomSpeed(0.12)
    setZoomRadius(16)
    setZoomBezier(DEFAULT_BEZIER_PRESETS[0].curve)
    setZoomTriggerMode('hold')
  }

  const activeCurveLabel = resolveCurveName(zoomBezier)
  const currentDurationSec =
    zoomSpeed === 0.08
      ? 0.70
      : zoomSpeed === 0.12
        ? 0.45
        : zoomSpeed === 0.22
          ? 0.25
          : Math.round(zoomSpeed * 100) / 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Studio Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-raised/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-signal/15 text-signal border border-signal/25">
              <ZoomIn size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink">Camera Zoom & Animation Studio</h2>
                <span className="rounded bg-signal/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-signal border border-signal/25">
                  Pro Viewport
                </span>
              </div>
              <p className="text-small text-ink-dim">
                Customize mouse follow magnification, corner radius, and Bézier easing curves with real-time feedback.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-small text-ink-dim hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
            <Button
              onClick={handleSave}
              className="flex items-center gap-1.5 bg-signal hover:bg-signal/90 text-white shadow-md font-semibold cursor-pointer"
            >
              <Check size={15} />
              <span>Save & Apply</span>
            </Button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-dim hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Studio 2-Column Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* LEFT COLUMN: Controls & Adjustments (Scrollable) */}
          <div className="lg:col-span-6 border-r border-line p-6 overflow-y-auto space-y-6 bg-surface">
            {/* Section 1: Trigger Mode & Key Selection */}
            <div className="space-y-3 rounded-lg border border-line bg-raised/20 p-4">
              <div className="flex items-center justify-between">
                <span className="label flex items-center gap-1.5 text-xs">
                  <Keyboard size={14} className="text-signal" /> Trigger Activation Mode
                </span>
                <span className="text-[10px] text-ink-faint">
                  {zoomTriggerMode === 'toggle' ? 'Click & interact freely' : 'Hold while zooming'}
                </span>
              </div>

              {/* Hold vs Toggle Mode Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setZoomTriggerMode('hold')}
                  className={cn(
                    'flex-1 rounded-lg border py-2 px-3 text-left transition-all cursor-pointer',
                    zoomTriggerMode === 'hold'
                      ? 'border-signal bg-signal/15 text-signal font-semibold shadow-sm'
                      : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
                  )}
                >
                  <div className="text-small font-bold">Hold Key Mode</div>
                  <div className="text-[10px] text-ink-faint">Zooms while key is held down</div>
                </button>

                <button
                  onClick={() => setZoomTriggerMode('toggle')}
                  className={cn(
                    'flex-1 rounded-lg border py-2 px-3 text-left transition-all cursor-pointer',
                    zoomTriggerMode === 'toggle'
                      ? 'border-signal bg-signal/15 text-signal font-semibold shadow-sm'
                      : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
                  )}
                >
                  <div className="text-small font-bold">Toggle Mode (Recommended)</div>
                  <div className="text-[10px] text-ink-faint">Press once to zoom & interact freely</div>
                </button>
              </div>

              {/* Hotkey choices categorized */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ok flex items-center gap-1">
                      <span>✓</span> 100% Browser-Safe Triggers (Never conflicts with clicks/links):
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {BROWSER_SAFE_KEYS.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => setZoomKey(k.id)}
                        className={cn(
                          'rounded-lg border py-2 px-2 text-left font-mono transition-all cursor-pointer',
                          zoomKey === k.id
                            ? 'border-signal bg-signal/15 text-signal font-bold shadow-sm'
                            : 'border-line text-ink-dim hover:border-line-strong hover:text-ink hover:bg-raised/40',
                        )}
                      >
                        <div className="text-[11px] font-bold truncate">{k.label}</div>
                        <div className="text-[9px] text-ink-faint">{k.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-ink-faint block">
                    Modifier Keys (Note: in Hold mode, Ctrl/Shift+Click triggers browser tab shortcuts):
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {MODIFIER_KEYS.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => setZoomKey(k.id)}
                        className={cn(
                          'rounded-lg border py-1.5 px-2 text-center font-mono text-small transition-all cursor-pointer',
                          zoomKey === k.id
                            ? 'border-signal bg-signal/15 text-signal font-bold shadow-sm'
                            : 'border-line text-ink-dim hover:border-line-strong hover:text-ink hover:bg-raised/40',
                        )}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Zoom Magnification Level */}
            <div className="space-y-3 rounded-lg border border-line bg-raised/20 p-4">
              <div className="flex items-center justify-between">
                <span className="label flex items-center gap-1.5 text-xs">
                  <Maximize2 size={14} className="text-signal" /> Zoom Magnification Level
                </span>
                <span className="font-mono text-signal font-bold text-sm bg-signal/10 px-2 py-0.5 rounded border border-signal/20">
                  {zoomFactor.toFixed(1)}x
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="1.1"
                max="6.0"
                step="0.1"
                value={zoomFactor}
                onChange={(e) => setZoomFactor(parseFloat(e.target.value))}
                className="w-full accent-signal cursor-pointer"
              />

              {/* Preset Buttons */}
              <div className="flex gap-2 pt-1">
                {ZOOM_PRESETS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setZoomFactor(f)}
                    className={cn(
                      'flex-1 rounded border py-1.5 font-mono text-small transition-colors cursor-pointer',
                      Math.abs(zoomFactor - f) < 0.05
                        ? 'border-signal bg-signal/15 text-signal font-semibold'
                        : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {f}x
                  </button>
                ))}
              </div>
            </div>

            {/* Section 3: Viewport Corner Radius */}
            <div className="space-y-3 rounded-lg border border-line bg-raised/20 p-4">
              <div className="flex items-center justify-between">
                <span className="label flex items-center gap-1.5 text-xs">
                  <Layers size={14} className="text-signal" /> Zoom Viewport Corner Radius
                </span>
                <span className="font-mono text-signal font-semibold text-small">
                  {zoomRadius === 0 ? 'Sharp (0px)' : `${zoomRadius}px Radius`}
                </span>
              </div>

              <div className="flex gap-2">
                {RADIUS_CHOICES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setZoomRadius(r)}
                    className={cn(
                      'flex-1 rounded border py-1.5 font-mono text-small transition-colors cursor-pointer',
                      zoomRadius === r
                        ? 'border-signal bg-signal/15 text-signal font-semibold shadow-sm'
                        : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {r === 0 ? 'Sharp' : `${r}px`}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 4: Heavily Customizable Animation Speed & Duration */}
            <div className="space-y-3 rounded-lg border border-line bg-raised/20 p-4">
              <div className="flex items-center justify-between">
                <span className="label flex items-center gap-1.5 text-xs">
                  <Gauge size={14} className="text-signal" /> Animation Pan Duration & Speed
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-ink-faint">Exact Duration:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setZoomSpeed(Math.max(0.05, Math.round((currentDurationSec - 0.05) * 100) / 100))
                      }
                      title="Decrease duration by 50ms"
                      className="flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-ink-dim hover:text-ink hover:border-line-strong cursor-pointer font-mono text-small"
                    >
                      -
                    </button>

                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min="0.05"
                        max="3.00"
                        step="0.01"
                        value={currentDurationSec}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) setZoomSpeed(Math.max(0.05, Math.min(3.0, val)))
                        }}
                        className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-small font-bold text-signal focus:border-signal focus:outline-none"
                      />
                      <span className="absolute right-1 text-[10px] font-mono text-ink-faint pointer-events-none">
                        s
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        setZoomSpeed(Math.min(3.0, Math.round((currentDurationSec + 0.05) * 100) / 100))
                      }
                      title="Increase duration by 50ms"
                      className="flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-ink-dim hover:text-ink hover:border-line-strong cursor-pointer font-mono text-small"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Wide Range Slider: 0.05s to 2.50s */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0.05"
                  max="2.50"
                  step="0.01"
                  value={currentDurationSec}
                  onChange={(e) => setZoomSpeed(parseFloat(e.target.value))}
                  className="w-full accent-signal cursor-pointer"
                />
                <div className="flex justify-between text-[9px] font-mono text-ink-faint">
                  <span>0.05s (Ultra Fast)</span>
                  <span>1.0s</span>
                  <span>2.50s (Slow Reveal)</span>
                </div>
              </div>

              {/* Speed Presets */}
              <div className="flex gap-1.5 pt-1">
                {SPEED_PRESETS.map((sp) => (
                  <button
                    key={sp.val}
                    onClick={() => setZoomSpeed(sp.val)}
                    className={cn(
                      'flex-1 rounded-lg border py-1.5 text-[11px] font-medium transition-colors cursor-pointer text-center',
                      Math.abs(currentDurationSec - sp.val) < 0.03
                        ? 'border-signal bg-signal/15 text-signal font-bold shadow-sm'
                        : 'border-line text-ink-dim hover:border-line-strong hover:text-ink hover:bg-raised/40',
                    )}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 5: Interactive Bézier Graph Editor */}
            <CubicBezierEditor
              value={zoomBezier}
              onChange={setZoomBezier}
            />
          </div>

          {/* RIGHT COLUMN: Live Interactive Studio Preview */}
          <div className="lg:col-span-6 p-6 flex flex-col justify-between bg-[#0b0d13]/60 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-signal" />
                  <h3 className="font-bold text-ink text-sm">Real-Time Viewport Preview</h3>
                </div>
                <span className="rounded bg-ok/10 text-ok border border-ok/20 font-mono text-[10px] px-2 py-0.5">
                  LIVE INTERACTION
                </span>
              </div>

              <p className="text-small text-ink-dim">
                Watch how your chosen magnification, radius styling, and Bézier curves feel in motion. Press your configured hotkey or hold the button below.
              </p>

              {/* Large Studio Preview Component */}
              <ZoomPreviewBox
                zoomFactor={zoomFactor}
                zoomKey={zoomKey}
                zoomSpeed={zoomSpeed}
                zoomRadius={zoomRadius}
                zoomBezier={zoomBezier}
              />
            </div>

            {/* Studio Bottom Summary Bar with accurate curve label */}
            <div className="mt-6 rounded-lg border border-line bg-raised/40 p-4 space-y-3">
              <span className="label text-xs">Active Camera Profile</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-small">
                <div className="rounded border border-line bg-surface p-2">
                  <span className="text-ink-faint text-[10px] block">Trigger Key</span>
                  <span className="text-signal font-bold">[{zoomKey.toUpperCase()}]</span>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <span className="text-ink-faint text-[10px] block">Magnification</span>
                  <span className="text-ink font-bold">{zoomFactor.toFixed(1)}x</span>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <span className="text-ink-faint text-[10px] block">Corner Radius</span>
                  <span className="text-ink font-bold">{zoomRadius}px</span>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <span className="text-ink-faint text-[10px] block">Easing Curve</span>
                  <span className="text-sky-400 font-bold truncate block" title={activeCurveLabel}>
                    {activeCurveLabel}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSave}
                  className="w-full sm:w-auto bg-signal hover:bg-signal/90 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check size={16} />
                  <span>Save & Return to Screen Record</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

