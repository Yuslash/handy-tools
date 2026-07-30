import { Film, FolderSearch } from 'lucide-react'
import { Button } from './ui/Button'
import type { GifState } from '../hooks/useGifConvert'

/**
 * Offer to turn a finished download into a GIF, and show conversion progress.
 * Previously this markup existed three times over with slightly different copy.
 */
export function GifPanel({
  state,
  onConvert,
  onReset,
}: {
  state: GifState
  onConvert: () => void
  onReset: () => void
}) {
  if (state.status === 'idle') {
    return (
      <Button onClick={onConvert} className="w-full justify-center">
        <Film size={14} /> Make a GIF from this
      </Button>
    )
  }

  if (state.status === 'done') {
    return (
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">GIF</span>
          <span className="font-mono text-data text-ok">Saved</span>
        </div>
        <p className="break-all font-mono text-data leading-relaxed text-ink-dim">{state.outputPath}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => state.outputPath && window.bench.revealFile(state.outputPath)}
          >
            <FolderSearch size={12} /> Show file
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Make another
          </Button>
        </div>
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">GIF</span>
          <span className="font-mono text-data text-bad">Failed</span>
        </div>
        <p className="text-small leading-relaxed text-bad">{state.message}</p>
        <Button size="sm" onClick={onReset}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label">Converting to GIF</span>
        <span className="font-mono text-data tabular-nums text-signal">
          {state.percent.toFixed(0)}%
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-200"
          style={{ width: `${state.percent}%` }}
        />
      </div>
      <p className="font-mono text-data text-ink-faint">{state.message}</p>
    </div>
  )
}
