import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderSearch, RotateCw, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { cn } from '../lib/utils'
import { useToolLog } from '../state/logs'
import type { LogScope } from '../lib/backend'

/**
 * What this tool is doing, in the app.
 *
 * Scoped: a screen shows its own events plus backend and app lifecycle, never
 * another tool's chatter. Backend lines stay visible everywhere because a
 * backend failure is usually the reason a tool failed.
 */
export function LogPanel({
  scope,
  defaultOpen = false,
}: {
  scope: LogScope
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [restarting, setRestarting] = useState(false)
  const { lines, clear } = useToolLog(scope)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, open])

  const errors = lines.filter((l) => l.level === 'error').length

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
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={14} className="text-ink-faint" />
          ) : (
            <ChevronRight size={14} className="text-ink-faint" />
          )}
          <span className="label">Activity</span>
          <span className="font-mono text-label text-ink-faint">
            {lines.length}
            {errors > 0 && <span className="text-bad"> · {errors} error{errors === 1 ? '' : 's'}</span>}
          </span>
        </button>

        {lines.length > 0 && (
          // "Clear log", not "Clear" — the page header has its own Clear for
          // the tool's inputs, and two bare "Clear" buttons on one screen is a
          // guessing game.
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 size={12} /> Clear log
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={restart} disabled={restarting}>
          <RotateCw size={12} className={restarting ? 'animate-spin' : undefined} />
          {restarting ? 'Restarting' : 'Restart backend'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.bench?.showLogFile()}>
          <FolderSearch size={12} /> File
        </Button>
      </div>

      {open && (
        <div className="max-h-72 overflow-auto border-t border-line bg-bg px-4 py-3">
          {lines.length === 0 ? (
            <p className="font-mono text-data text-ink-faint">Nothing yet.</p>
          ) : (
            <div className="space-y-1">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-3 font-mono text-data">
                  <span className="shrink-0 tabular-nums text-ink-faint">
                    {new Date(line.at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      'w-16 shrink-0',
                      line.source === 'backend' ? 'text-signal' : 'text-ink-faint',
                    )}
                  >
                    {line.source === 'backend' ? 'backend' : (line.scope ?? 'app')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 break-all',
                      line.level === 'error' ? 'text-bad' : 'text-ink-dim',
                    )}
                  >
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
