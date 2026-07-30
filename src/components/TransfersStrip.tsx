import { FolderSearch, X } from 'lucide-react'
import { useTransfers } from '../state/transfers'
import type { Transfer } from '../state/transfers'
import { cn } from '../lib/utils'

/**
 * Downloads in progress, visible from every tool.
 *
 * This is what the old modal-based UI could not do: closing a tool destroyed its
 * download state even though the download kept running.
 */
export function TransfersStrip() {
  const { transfers, clearFinished, dismiss } = useTransfers()

  if (transfers.length === 0) {
    return (
      <div className="mt-auto border-t border-line p-3">
        <p className="label">Transfers</p>
        <p className="mt-1.5 text-small leading-snug text-ink-faint">
          Downloads appear here and keep running while you switch tools.
        </p>
      </div>
    )
  }

  const finishedCount = transfers.filter((t) => t.status === 'done' || t.status === 'failed').length

  return (
    <div className="mt-auto flex min-h-0 flex-col border-t border-line">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <p className="label">Transfers</p>
        {finishedCount > 0 && (
          <button
            onClick={clearFinished}
            className="font-mono text-label text-ink-faint transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-2">
        {transfers.map((t) => (
          <TransferRow key={t.id} transfer={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </ul>
    </div>
  )
}

function TransferRow({ transfer, onDismiss }: { transfer: Transfer; onDismiss: () => void }) {
  const { status, percent, label, speed, error, note, filePath } = transfer
  const inFlight = status === 'downloading' || status === 'merging'

  return (
    <li className="group rounded-md px-1.5 py-1.5 hover:bg-raised">
      <div className="flex items-start justify-between gap-1.5">
        <p className="line-clamp-1 flex-1 text-small leading-snug text-ink" title={label}>
          {label}
        </p>
        <button
          onClick={onDismiss}
          aria-label={`Dismiss ${label}`}
          className="shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>

      {inFlight && (
        <>
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-label tabular-nums text-ink-faint">
            {status === 'merging' ? (note ?? 'Merging…') : `${percent.toFixed(0)}%${speed ? ` · ${speed}` : ''}`}
          </p>
        </>
      )}

      {status === 'done' && (
        <button
          onClick={() => filePath && window.bench.revealFile(filePath)}
          className="mt-0.5 flex items-center gap-1 font-mono text-label text-ok transition-colors hover:text-ink"
        >
          <FolderSearch size={10} /> Saved — show file
        </button>
      )}

      {status === 'failed' && (
        <p className={cn('mt-0.5 font-mono text-label leading-snug text-bad')} title={error}>
          {error}
        </p>
      )}
    </li>
  )
}
