import { useState } from 'react'
import { FileVideo, Film } from 'lucide-react'
import { Page } from '../components/Page'
import { Button } from '../components/ui/Button'
import { GifPanel } from '../components/GifPanel'
import { TimeRange, parseTimecode } from '../components/TimeRange'
import { useGifConvert } from '../hooks/useGifConvert'
import { cn } from '../lib/utils'

const FPS_CHOICES = [10, 15, 20, 25]
const WIDTH_CHOICES = [320, 480, 640, 800]

/** Convert a local video file to a GIF, optionally trimming to a range first. */
export function Gif() {
  const [path, setPath] = useState('')
  const [fps, setFps] = useState(15)
  const [width, setWidth] = useState(480)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const gif = useGifConvert()

  const startSec = parseTimecode(start)
  const endSec = parseTimecode(end)
  const rangeInvalid = startSec !== null && endSec !== null && endSec <= startSec

  const choose = async () => {
    const chosen = await window.bench.selectFile()
    if (!chosen) return
    setPath(chosen)
    gif.reset()
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
    <Page title="GIF" description="Turn a video file into a GIF, with optional trimming.">
      <div className="space-y-5">
        <div className="flex gap-2">
          <div className="field flex flex-1 items-center overflow-hidden">
            <span className={cn('truncate', !path && 'text-ink-faint')}>
              {path || 'No file chosen'}
            </span>
          </div>
          <Button variant="signal" onClick={choose} className="shrink-0">
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

          <div className="h-px bg-rule" />

          <ChoiceRow
            label="Width"
            hint="Height follows the source"
            options={WIDTH_CHOICES}
            value={width}
            onChange={setWidth}
            format={(v) => `${v} px`}
          />

          <div className="h-px bg-rule" />

          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} invalid={rangeInvalid} />
          <p className="text-[12px] text-ink-faint">Leave the range empty to convert the whole file.</p>
        </div>

        <Button
          variant="signal"
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
              'flex-1 rounded-md border py-1.5 font-mono text-[12px] tabular-nums transition-colors duration-100',
              value === option
                ? 'border-signal bg-signal/10 text-signal'
                : 'border-rule text-ink-dim hover:border-rule-bright hover:text-ink',
            )}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  )
}
