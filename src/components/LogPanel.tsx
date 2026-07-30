import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderSearch, RotateCw } from 'lucide-react'
import { Button } from './ui/Button'
import { cn } from '../lib/utils'
import type { LogLine } from '../lib/backend'

/**
 * Backend output, in the app.
 *
 * This used to go only to a console the user never sees, so a backend that
 * failed to start looked identical to one that was merely slow.
 */
export function LogPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [lines, setLines] = useState<LogLine[]>([])
  const [restarting, setRestarting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.bench?.getLogs().then(setLines).catch(() => {})
    return window.bench?.onLog((line) => {
      setLines((prev) => [...prev.slice(-499), line])
    })
  }, [])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, open])

  const errorCount = lines.filter((l) => l.level === 'error').length

  const restart = async () => {
    setRestarting(true)
    try {
      await window.bench?.restartBackend()
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={13} className="text-ink-faint" />
          ) : (
            <ChevronRight size={13} className="text-ink-faint" />
          )}
          <span className="label">Log</span>
          <span className="font-mono text-[10px] text-ink-faint">
            {lines.length} line{lines.length === 1 ? '' : 's'}
            {errorCount > 0 && <span className="text-fault"> · {errorCount} error{errorCount === 1 ? '' : 's'}</span>}
          </span>
        </button>

        <Button size="sm" variant="quiet" onClick={restart} disabled={restarting}>
          <RotateCw size={11} className={restarting ? 'animate-spin' : undefined} />
          {restarting ? 'Restarting' : 'Restart backend'}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => window.bench?.showLogFile()}>
          <FolderSearch size={11} /> Log file
        </Button>
      </div>

      {open && (
        <div className="max-h-64 overflow-auto border-t border-rule bg-surround px-3 py-2">
          {lines.length === 0 ? (
            <p className="font-mono text-[11px] text-ink-faint">Nothing logged yet.</p>
          ) : (
            <div className="space-y-0.5">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
                  <span className="shrink-0 text-ink-faint tabular-nums">
                    {new Date(line.at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      'shrink-0',
                      line.source === 'backend' ? 'text-signal-dim' : 'text-ink-faint',
                    )}
                  >
                    {line.source === 'backend' ? 'backend' : 'app'}
                  </span>
                  <span className={cn('min-w-0 break-all', line.level === 'error' ? 'text-fault' : 'text-ink-dim')}>
                    {line.text}
                  </span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
