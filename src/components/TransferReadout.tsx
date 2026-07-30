import { FolderSearch } from 'lucide-react'
import { Button } from './ui/Button'
import type { Transfer } from '../state/transfers'

/** In-page progress for a transfer the current tool started. */
export function TransferReadout({ transfer }: { transfer: Transfer }) {
  const { status, percent, speed, eta, error, note, filePath } = transfer

  if (status === 'failed') {
    return (
      <div className="panel space-y-2 p-4">
        <span className="label">Failed</span>
        <p className="text-body leading-relaxed text-bad">{error}</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">Saved</span>
          <span className="font-mono text-data text-ok">Complete</span>
        </div>
        {filePath && (
          <p className="break-all font-mono text-data leading-relaxed text-ink-dim">{filePath}</p>
        )}
        <Button size="sm" onClick={() => filePath && window.bench.revealFile(filePath)}>
          <FolderSearch size={12} /> Show file
        </Button>
      </div>
    )
  }

  const merging = status === 'merging'

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label">{merging ? 'Merging' : 'Downloading'}</span>
        <span className="font-mono text-data tabular-nums text-signal">
          {merging ? '—' : `${percent.toFixed(1)}%`}
        </span>
      </div>

      <div className="relative h-1 overflow-hidden rounded-full bg-bg">
        {merging ? (
          // Merging has no percentage to report, so show motion, not a fake number.
          <div className="animate-sweep absolute inset-y-0 w-1/3 rounded-full bg-signal/70" />
        ) : (
          <div
            className="h-full rounded-full bg-signal transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <p className="font-mono text-data tabular-nums text-ink-faint">
        {merging
          ? (note ?? 'Combining video and audio…')
          : [speed, eta && eta !== 'N/A' && `${eta} left`].filter(Boolean).join(' · ') || 'Starting…'}
      </p>
    </div>
  )
}
