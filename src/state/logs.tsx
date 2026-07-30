import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LogLine, LogScope } from '../lib/backend'

/**
 * One log store, read per tool.
 *
 * Every tool writes what it is doing here, and each screen reads only its own
 * scope — so the GIF log does not fill up with download chatter. Backend and
 * app lifecycle lines land in 'system' and are shown alongside whichever tool
 * you are looking at, because a backend failure explains a tool failure.
 */

interface LogsValue {
  lines: LogLine[]
  /** Lines for one tool, plus system lines, oldest first. */
  forScope: (scope: LogScope) => LogLine[]
  /** Record an event from the UI. */
  log: (scope: LogScope, text: string, level?: 'info' | 'error') => void
  clear: (scope: LogScope) => void
}

const LogsContext = createContext<LogsValue | null>(null)

const LIMIT = 600

export function LogsProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<LogLine[]>([])

  useEffect(() => {
    // Seed with whatever main already captured before the renderer mounted.
    window.bench
      ?.getLogs()
      .then((existing) => setLines(existing.map((l) => ({ ...l, scope: l.scope ?? 'system' }))))
      .catch(() => {})

    return window.bench?.onLog((line) => {
      setLines((prev) => [...prev, { ...line, scope: line.scope ?? 'system' }].slice(-LIMIT))
    })
  }, [])

  const log = useCallback((scope: LogScope, text: string, level: 'info' | 'error' = 'info') => {
    setLines((prev) =>
      [...prev, { at: Date.now(), source: 'app' as const, level, text, scope }].slice(-LIMIT),
    )
  }, [])

  const forScope = useCallback(
    (scope: LogScope) => lines.filter((l) => l.scope === scope || l.scope === 'system'),
    [lines],
  )

  const clear = useCallback((scope: LogScope) => {
    setLines((prev) => prev.filter((l) => l.scope !== scope))
  }, [])

  const value = useMemo(() => ({ lines, forScope, log, clear }), [lines, forScope, log, clear])

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>
}

export function useLogs() {
  const ctx = useContext(LogsContext)
  if (!ctx) throw new Error('useLogs must be used inside LogsProvider')
  return ctx
}

/** Bind the logger to one tool so call sites don't repeat the scope. */
export function useToolLog(scope: LogScope) {
  const { log, forScope, clear } = useLogs()
  return useMemo(
    () => ({
      lines: forScope(scope),
      info: (text: string) => log(scope, text),
      error: (text: string) => log(scope, text, 'error'),
      clear: () => clear(scope),
    }),
    [scope, log, forScope, clear],
  )
}
