import { cn } from '../lib/utils'

/**
 * Start/end timecode entry.
 *
 * The timeline is the app's structural device, and it appears only where time is
 * genuinely a dimension of the work — here and in GIF trimming.
 */
export function TimeRange({
  start,
  end,
  onStart,
  onEnd,
  invalid,
}: {
  start: string
  end: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  invalid?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="label">Range</span>
        <span className="label">hh:mm:ss or seconds</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          className={cn('field text-center', invalid && 'border-fault')}
          value={start}
          onChange={(e) => onStart(e.target.value)}
          placeholder="00:00:00"
          aria-label="Start time"
          spellCheck={false}
        />
        <span className="h-px w-4 shrink-0 bg-rule-bright" aria-hidden />
        <input
          className={cn('field text-center', invalid && 'border-fault')}
          value={end}
          onChange={(e) => onEnd(e.target.value)}
          placeholder="00:01:30"
          aria-label="End time"
          spellCheck={false}
        />
      </div>

      {invalid && <p className="text-[12px] text-fault">The end time must come after the start time.</p>}
    </div>
  )
}

/** Seconds from "hh:mm:ss", "mm:ss", or a plain number. Null if unparseable. */
export function parseTimecode(value: string): number | null {
  const v = value.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v)

  const parts = v.split(':')
  if (parts.length < 2 || parts.length > 3) return null

  let seconds = 0
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part.trim())) return null
    seconds = seconds * 60 + Number(part)
  }
  return seconds
}
