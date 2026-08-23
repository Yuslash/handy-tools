import { useRef, useState, useCallback, useEffect } from 'react'
import { Sparkles, RotateCcw, Plus, Trash2, Check, Bookmark, Copy, ClipboardPaste } from 'lucide-react'
import { cn } from '../lib/utils'

export type BezierCurve = [number, number, number, number] // [x1, y1, x2, y2]

export interface SavedPreset {
  id: string
  name: string
  curve: BezierCurve
}

export const DEFAULT_BEZIER_PRESETS: { name: string; curve: BezierCurve }[] = [
  { name: 'Smooth (Ease-Out)', curve: [0.22, 1.0, 0.36, 1.0] },
  { name: 'Cinematic (In-Out)', curve: [0.45, 0.05, 0.55, 0.95] },
  { name: 'Spring / Bounce', curve: [0.34, 1.56, 0.64, 1.0] },
  { name: 'Snappy (Fast)', curve: [0.16, 1.0, 0.3, 1.0] },
  { name: 'Linear', curve: [0.0, 0.0, 1.0, 1.0] },
]

export function resolveCurveName(curve: BezierCurve): string {
  const [x1, y1, x2, y2] = curve
  const close = (a: number, b: number) => Math.abs(a - b) < 0.06

  if (close(x1, 0.34) && close(y1, 1.56) && close(x2, 0.64) && close(y2, 1.0)) {
    return 'Spring / Bounce'
  }
  if (close(x1, 0.22) && close(y1, 1.0) && close(x2, 0.36) && close(y2, 1.0)) {
    return 'Smooth (Ease-Out)'
  }
  if (close(x1, 0.45) && close(y1, 0.05) && close(x2, 0.55) && close(y2, 0.95)) {
    return 'Cinematic'
  }
  if (close(x1, 0.16) && close(y1, 1.0) && close(x2, 0.3) && close(y2, 1.0)) {
    return 'Snappy (Fast)'
  }
  if (close(x1, 0.0) && close(y1, 0.0) && close(x2, 1.0) && close(y2, 1.0)) {
    return 'Linear'
  }

  // Check saved presets in localStorage
  try {
    const saved = localStorage.getItem('bench.custom_bezier_presets.v1')
    if (saved) {
      const list = JSON.parse(saved)
      for (const p of list) {
        if (
          close(x1, p.curve[0]) &&
          close(y1, p.curve[1]) &&
          close(x2, p.curve[2]) &&
          close(y2, p.curve[3])
        ) {
          return p.name
        }
      }
    }
  } catch {}

  return `Custom (${x1.toFixed(2)}, ${y1.toFixed(2)})`
}

const STORAGE_KEY_CUSTOM_PRESETS = 'bench.custom_bezier_presets.v1'

interface CubicBezierEditorProps {
  value: BezierCurve
  onChange: (val: BezierCurve) => void
}

export function CubicBezierEditor({ value, onChange }: CubicBezierEditorProps) {
  const [x1, y1, x2, y2] = value
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingPoint, setDraggingPoint] = useState<1 | 2 | null>(null)

  const [customPresets, setCustomPresets] = useState<SavedPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [isAddingPreset, setIsAddingPreset] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [pasteInput, setPasteInput] = useState('')
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState(false)

  const saveCustomPreset = () => {
    const name = newPresetName.trim() || `Custom ${customPresets.length + 1}`
    const newPreset: SavedPreset = {
      id: `preset_${Date.now()}`,
      name,
      curve: [x1, y1, x2, y2],
    }
    const updated = [...customPresets, newPreset]
    setCustomPresets(updated)
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(updated))
    setNewPresetName('')
    setIsAddingPreset(false)
  }

  const deleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = customPresets.filter((p) => p.id !== id)
    setCustomPresets(updated)
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(updated))
  }

  // Parse pasted cubic-bezier strings from CSS, Framer, Figma, easing.net
  const handlePasteCurve = (str: string) => {
    setPasteInput(str)
    if (!str.trim()) return

    // Match 4 float/int numbers separated by commas or spaces
    const matches = str.match(/-?\d+(\.\d+)?/g)
    if (matches && matches.length >= 4) {
      const p1x = Math.max(0, Math.min(1, parseFloat(matches[0])))
      const p1y = parseFloat(matches[1])
      const p2x = Math.max(0, Math.min(1, parseFloat(matches[2])))
      const p2y = parseFloat(matches[3])

      if (!isNaN(p1x) && !isNaN(p1y) && !isNaN(p2x) && !isNaN(p2y)) {
        onChange([p1x, p1y, p2x, p2y])
        setPasteError(false)
        return
      }
    }
    setPasteError(true)
  }

  const handleCopy = (format: 'css' | 'array') => {
    let text = ''
    if (format === 'css') {
      text = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
    } else {
      text = `[${x1}, ${y1}, ${x2}, ${y2}]`
    }
    navigator.clipboard.writeText(text)
    setCopiedFormat(format)
    setTimeout(() => setCopiedFormat(null), 1800)
  }

  // SVG coordinate system with extra top headroom for spring/bounce overshoot
  const BOX_X = 35
  const BOX_Y = 48
  const BOX_W = 190
  const BOX_H = 96

  const toSvgX = (x: number) => BOX_X + x * BOX_W
  const toSvgY = (y: number) => BOX_Y + (1 - y) * BOX_H

  const fromSvgCoords = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }

      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return { x: 0, y: 0 }

      const svgP = pt.matrixTransform(ctm.inverse())

      const nx = Math.max(0, Math.min(1, (svgP.x - BOX_X) / BOX_W))
      const ny = Math.max(-0.4, Math.min(1.8, 1 - (svgP.y - BOX_Y) / BOX_H))
      return {
        x: Math.round(nx * 100) / 100,
        y: Math.round(ny * 100) / 100,
      }
    },
    [BOX_X, BOX_Y, BOX_W, BOX_H],
  )

  useEffect(() => {
    if (!draggingPoint) return

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const { x, y } = fromSvgCoords(clientX, clientY)
      if (draggingPoint === 1) {
        onChange([x, y, x2, y2])
      } else if (draggingPoint === 2) {
        onChange([x1, y1, x, y])
      }
    }

    const handlePointerUp = () => {
      setDraggingPoint(null)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove)
    window.addEventListener('touchend', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [draggingPoint, fromSvgCoords, onChange, x1, y1, x2, y2])

  // Curve coordinates
  const startX = toSvgX(0)
  const startY = toSvgY(0)
  const endX = toSvgX(1)
  const endY = toSvgY(1)

  const cp1X = toSvgX(x1)
  const cp1Y = toSvgY(y1)
  const cp2X = toSvgX(x2)
  const cp2Y = toSvgY(y2)

  const pathD = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`

  const currentCurveName = resolveCurveName([x1, y1, x2, y2])

  return (
    <div className="space-y-3 rounded-lg border border-line bg-raised/30 p-3.5">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-signal" />
          <span className="label text-[11px]">Camera Animation Curve (Bézier Graph)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddingPreset(!isAddingPreset)}
            className="flex items-center gap-1 text-[10px] text-signal hover:text-signal/80 font-medium transition-colors cursor-pointer"
          >
            <Plus size={11} />
            <span>Save Custom Animation</span>
          </button>
          <button
            onClick={() => onChange(DEFAULT_BEZIER_PRESETS[0].curve)}
            title="Reset to default smooth curve"
            className="flex items-center gap-1 text-[10px] text-ink-faint hover:text-ink transition-colors cursor-pointer"
          >
            <RotateCcw size={10} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Animation Preset Dropdown Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-ink-dim">
          <span>Select Animation Preset / Saved Curve</span>
          {customPresets.some((p) => p.name === currentCurveName) && (
            <button
              onClick={(e) => {
                const found = customPresets.find((p) => p.name === currentCurveName)
                if (found) deleteCustomPreset(found.id, e)
              }}
              className="flex items-center gap-1 text-[10px] text-bad hover:underline cursor-pointer"
            >
              <Trash2 size={10} />
              <span>Delete Saved Preset</span>
            </button>
          )}
        </div>
        <select
          value={currentCurveName}
          onChange={(e) => {
            const val = e.target.value
            const defaultMatch = DEFAULT_BEZIER_PRESETS.find((p) => p.name === val)
            if (defaultMatch) {
              onChange(defaultMatch.curve)
              return
            }
            const customMatch = customPresets.find((p) => p.name === val)
            if (customMatch) {
              onChange(customMatch.curve)
            }
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-small text-ink focus:border-signal focus:outline-none transition-colors cursor-pointer"
        >
          <optgroup label="Built-in Easing Presets">
            {DEFAULT_BEZIER_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} — [{p.curve.join(', ')}]
              </option>
            ))}
          </optgroup>

          {customPresets.length > 0 && (
            <optgroup label="My Saved Custom Animations">
              {customPresets.map((p) => (
                <option key={p.id} value={p.name}>
                  ★ {p.name} — [{p.curve.join(', ')}]
                </option>
              ))}
            </optgroup>
          )}

          {!DEFAULT_BEZIER_PRESETS.some((p) => p.name === currentCurveName) &&
            !customPresets.some((p) => p.name === currentCurveName) && (
              <option value={currentCurveName}>
                Custom Adjusted Curve ({x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)})
              </option>
            )}
        </select>
      </div>

      {/* Save Custom Preset Form */}
      {isAddingPreset && (
        <div className="flex items-center gap-2 rounded-md border border-signal/30 bg-signal/5 p-2 animate-in fade-in">
          <Bookmark size={13} className="text-signal shrink-0" />
          <input
            type="text"
            placeholder="Animation Name (e.g. My Fast Pop)"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCustomPreset()}
            autoFocus
            className="flex-1 bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            onClick={saveCustomPreset}
            className="flex h-6 items-center gap-1 rounded bg-signal px-2 text-[11px] font-semibold text-white hover:bg-signal/90 cursor-pointer shadow-sm"
          >
            <Check size={11} />
            <span>Save</span>
          </button>
          <button
            onClick={() => setIsAddingPreset(false)}
            className="text-[11px] text-ink-faint hover:text-ink px-1 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Interactive SVG Curve Editor (1:1 CTM Matrix Transform) */}
      <div className="relative flex items-center justify-center rounded-md border border-line-strong bg-[#0c0e14] p-1 shadow-inner select-none">
        <svg
          ref={svgRef}
          viewBox="0 0 260 170"
          className="h-44 w-full overflow-visible"
        >
          {/* Grid lines */}
          <rect
            x={BOX_X}
            y={BOX_Y}
            width={BOX_W}
            height={BOX_H}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <line
            x1={BOX_X}
            y1={toSvgY(0.5)}
            x2={BOX_X + BOX_W}
            y2={toSvgY(0.5)}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="2,2"
          />
          <line
            x1={toSvgX(0.5)}
            y1={BOX_Y}
            x2={toSvgX(0.5)}
            y2={BOX_Y + BOX_H}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="2,2"
          />

          {/* Diagonal Reference Line (Linear) */}
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="3,3"
            strokeWidth="1"
          />

          {/* Control Point 1 Handle Line (Start) */}
          <line
            x1={startX}
            y1={startY}
            x2={cp1X}
            y2={cp1Y}
            stroke="#ea580c"
            strokeWidth="1.5"
            strokeDasharray="2,2"
            opacity="0.8"
          />

          {/* Control Point 2 Handle Line (End) */}
          <line
            x1={endX}
            y1={endY}
            x2={cp2X}
            y2={cp2Y}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="2,2"
            opacity="0.8"
          />

          {/* The Cubic Bézier Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#curve-grad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Gradients */}
          <defs>
            <linearGradient id="curve-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          {/* Start Point (0,0) */}
          <circle cx={startX} cy={startY} r="4" fill="#ea580c" />

          {/* End Point (1,1) */}
          <circle cx={endX} cy={endY} r="4" fill="#38bdf8" />

          {/* Draggable Control Point 1 (Start Anchor) */}
          <g
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              e.stopPropagation()
              setDraggingPoint(1)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              setDraggingPoint(1)
            }}
          >
            <circle cx={cp1X} cy={cp1Y} r="20" fill="transparent" />
            <circle
              cx={cp1X}
              cy={cp1Y}
              r="7"
              fill="#ea580c"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <text
              x={cp1X}
              y={cp1Y - 11}
              textAnchor="middle"
              fill="#ea580c"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              P1 (Start)
            </text>
          </g>

          {/* Draggable Control Point 2 (End Anchor) */}
          <g
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              e.stopPropagation()
              setDraggingPoint(2)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              setDraggingPoint(2)
            }}
          >
            <circle cx={cp2X} cy={cp2Y} r="20" fill="transparent" />
            <circle
              cx={cp2X}
              cy={cp2Y}
              r="7"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <text
              x={cp2X}
              y={cp2Y + 18}
              textAnchor="middle"
              fill="#38bdf8"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              P2 (End)
            </text>
          </g>
        </svg>
      </div>

      {/* Manual Coordinates Editor (P1 X, Y & P2 X, Y Inputs) */}
      <div className="space-y-2 rounded-md border border-line bg-surface p-2.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-ink-dim">
          <span>Manual Point Coordinates</span>
          <span className="text-[10px] text-ink-faint">Fine-tune values</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-signal font-mono block">P1 X</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={x1}
              onChange={(e) => onChange([parseFloat(e.target.value) || 0, y1, x2, y2])}
              className="w-full rounded border border-line bg-raised px-1.5 py-1 font-mono text-small text-ink focus:border-signal focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-signal font-mono block">P1 Y</label>
            <input
              type="number"
              step="0.01"
              value={y1}
              onChange={(e) => onChange([x1, parseFloat(e.target.value) || 0, x2, y2])}
              className="w-full rounded border border-line bg-raised px-1.5 py-1 font-mono text-small text-ink focus:border-signal focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-sky-400 font-mono block">P2 X</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={x2}
              onChange={(e) => onChange([x1, y1, parseFloat(e.target.value) || 0, y2])}
              className="w-full rounded border border-line bg-raised px-1.5 py-1 font-mono text-small text-ink focus:border-signal focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-sky-400 font-mono block">P2 Y</label>
            <input
              type="number"
              step="0.01"
              value={y2}
              onChange={(e) => onChange([x1, y1, x2, parseFloat(e.target.value) || 0])}
              className="w-full rounded border border-line bg-raised px-1.5 py-1 font-mono text-small text-ink focus:border-signal focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Paste / Import Input Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-ink-dim font-medium">
            <ClipboardPaste size={12} className="text-signal" />
            Paste Shared Curve String
          </span>
          {pasteError && (
            <span className="text-[10px] text-bad font-medium">Invalid curve format</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="e.g. cubic-bezier(0.25, 0.1, 0.25, 1) or [0.25, 0.1, 0.25, 1]"
            value={pasteInput}
            onChange={(e) => handlePasteCurve(e.target.value)}
            className={cn(
              'flex-1 rounded-md border px-2.5 py-1.5 font-mono text-small text-ink placeholder:text-ink-faint focus:outline-none transition-colors',
              pasteError ? 'border-bad bg-bad/5' : 'border-line bg-surface focus:border-signal',
            )}
          />
          {pasteInput && (
            <button
              onClick={() => {
                setPasteInput('')
                setPasteError(false)
              }}
              className="text-[10px] text-ink-faint hover:text-ink px-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Export / Copy Action Format Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-ink-dim bg-raised/50 p-2 rounded-md border border-line">
        <div className="truncate">
          cubic-bezier(
          <strong className="text-signal">{x1}</strong>,{' '}
          <strong className="text-signal">{y1}</strong>,{' '}
          <strong className="text-sky-400">{x2}</strong>,{' '}
          <strong className="text-sky-400">{y2}</strong>)
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => handleCopy('css')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 transition-colors border',
              copiedFormat === 'css'
                ? 'border-ok bg-ok/15 text-ok font-semibold'
                : 'border-line hover:border-line-strong hover:bg-raised text-ink',
            )}
          >
            {copiedFormat === 'css' ? <Check size={10} /> : <Copy size={10} />}
            <span>{copiedFormat === 'css' ? 'Copied CSS!' : 'Copy CSS'}</span>
          </button>

          <button
            onClick={() => handleCopy('array')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 transition-colors border',
              copiedFormat === 'array'
                ? 'border-ok bg-ok/15 text-ok font-semibold'
                : 'border-line hover:border-line-strong hover:bg-raised text-ink',
            )}
          >
            {copiedFormat === 'array' ? <Check size={10} /> : <Copy size={10} />}
            <span>{copiedFormat === 'array' ? 'Copied Array!' : 'Copy Array'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
