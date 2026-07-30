import { Minus, Square, X } from 'lucide-react'
import { useBackend } from '../state/backend'

/** Frameless-window chrome. The status dot reports the real backend state. */
export function Titlebar() {
  const backend = useBackend()

  const status = {
    starting: { color: 'bg-signal', text: 'Starting backend' },
    ready: { color: 'bg-ok', text: 'Backend ready' },
    failed: { color: 'bg-bad', text: 'Backend not running' },
  }[backend.state]

  return (
    <header className="draggable flex h-9 shrink-0 items-center justify-between border-b border-line bg-bg pl-3">
      <div className="flex items-center gap-3">
        <span className="font-display text-body font-semibold tracking-tight text-ink">Bench</span>
        <span className="h-3 w-px bg-line" />
        <span
          className="flex items-center gap-1.5"
          title={backend.state === 'failed' ? backend.reason : undefined}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.color}`} />
          <span className="font-mono text-label text-ink-faint">{status.text}</span>
        </span>
      </div>

      <div className="no-drag flex items-center">
        <button
          onClick={() => window.bench.minimize()}
          aria-label="Minimize"
          className="flex h-9 w-11 items-center justify-center text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.bench.toggleMaximize()}
          aria-label="Maximize"
          className="flex h-9 w-11 items-center justify-center text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.bench.close()}
          aria-label="Close"
          className="flex h-9 w-11 items-center justify-center text-ink-dim transition-colors hover:bg-bad hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
