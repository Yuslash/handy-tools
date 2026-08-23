import { FileVideo, Film } from 'lucide-react'
import { Page } from '../components/Page'
import { Button } from '../components/ui/Button'
import { GifPanel } from '../components/GifPanel'
import { TimeRange, parseTimecode } from '../components/TimeRange'
import { useGifConvert } from '../hooks/useGifConvert'
import { cn } from '../lib/utils'
import { useToolLog } from '../state/logs'
import { useToolInputs } from '../state/inputs'
const FPS_CHOICES = [15, 24, 30, 60]
const WIDTH_CHOICES = [480, 640, 800, 1080]
/** Convert a local video file to a GIF, optionally trimming to a range first. */
export function Gif() {
  const { values, set, clear } = useToolInputs('gif')
  const { path, fps, width, start, end } = values
  const setPath = (v: string) => set({ path: v })
  const setFps = (v: number) => set({ fps: v })
  const setWidth = (v: number) => set({ width: v })
  const setStart = (v: string) => set({ start: v })
  const setEnd = (v: string) => set({ end: v })
  const gif = useGifConvert('gif')
  const log = useToolLog('gif')
  const reset = () => {
    clear()
    gif.reset()
  }
  const startSec = parseTimecode(start)
  const endSec = parseTimecode(end)
  const rangeInvalid = startSec !== null && endSec !== null && endSec <= startSec
  const choose = async () => {
    const chosen = await window.bench.selectFile()
    if (!chosen) return
    setPath(chosen)
    gif.reset()
    log.info(`Selected ${chosen}`)
  }
  const convert = () => {
    gif.convert({
      file_path: path,
      fps,
      width,
      start_time: start.trim() || undefined,
      end_time: end.trim() || undefined,
    })
  }
  return (
    <Page onClear={reset} canClear={Boolean(path || start || end)} scope="gif" title="GIF" description="Turn a video file into a GIF, with optional trimming.">
      <div className="space-y-6">
        <div className="flex gap-2">
          <div className="field flex flex-1 items-center overflow-hidden">
            <span className={cn('truncate', !path && 'text-ink-faint')}>
              {path || 'No file chosen'}
            </span>
          </div>
          <Button variant="primary" onClick={choose} className="shrink-0">
            <FileVideo size={14} /> Choose file
          </Button>
        </div>
        <div className="panel space-y-4 p-4">
          <ChoiceRow
            label="Frame rate"
            hint="Higher is smoother and larger"
            options={FPS_CHOICES}
            value={fps}
            onChange={setFps}
            format={(v) => `${v} fps`}
          />
          <div className="h-px bg-line" />
          <ChoiceRow
            label="Width"
            hint="Height follows the source"
            options={WIDTH_CHOICES}
            value={width}
            onChange={setWidth}
            format={(v) => `${v} px`}
          />
          <div className="h-px bg-line" />
          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} invalid={rangeInvalid} />
          <p className="text-small text-ink-faint">Leave the range empty to convert the whole file.</p>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full justify-center"
          onClick={convert}
          disabled={!path || rangeInvalid || gif.state.status === 'converting'}
        >
          <Film size={14} />
          {gif.state.status === 'converting' ? 'Converting' : 'Make GIF'}
        </Button>
        {gif.state.status !== 'idle' && (
          <GifPanel state={gif.state} onConvert={convert} onReset={gif.reset} />
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
                ? 'border-signal bg-signal/10 text-signal'
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
