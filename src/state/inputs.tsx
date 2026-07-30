import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * What you typed into each tool, kept until you clear it.
 *
 * Every tool used to hold its inputs in local useState, so switching tools
 * unmounted the route and threw away the URL, the timecodes and any fetched
 * formats. Now they live here.
 *
 * Two lifetimes, deliberately:
 *   - typed input (URLs, paths, timecodes, options) is written to localStorage
 *     and survives a restart, because retyping a URL is pure friction;
 *   - fetched results (format lists, inspection reports) stay in memory only,
 *     because a stored format list goes stale and would be a lie after a
 *     restart.
 */

export interface DownloadInputs {
  url: string
}
export interface ClipInputs {
  url: string
}
export interface SegmentInputs {
  url: string
  start: string
  end: string
}
export interface InspectInputs {
  path: string
}
export interface GifInputs {
  path: string
  fps: number
  width: number
  start: string
  end: string
}

export interface InputState {
  download: DownloadInputs
  clip: ClipInputs
  segment: SegmentInputs
  inspect: InspectInputs
  gif: GifInputs
}

export const EMPTY: InputState = {
  download: { url: '' },
  clip: { url: '' },
  segment: { url: '', start: '', end: '' },
  inspect: { path: '' },
  gif: { path: '', fps: 15, width: 480, start: '', end: '' },
}

const STORAGE_KEY = 'bench.inputs.v1'

function load(): InputState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const saved = JSON.parse(raw) as Partial<InputState>
    // Merge per tool so a new field added later still gets its default.
    return {
      download: { ...EMPTY.download, ...saved.download },
      clip: { ...EMPTY.clip, ...saved.clip },
      segment: { ...EMPTY.segment, ...saved.segment },
      inspect: { ...EMPTY.inspect, ...saved.inspect },
      gif: { ...EMPTY.gif, ...saved.gif },
    }
  } catch {
    return EMPTY
  }
}

type Tool = keyof InputState

interface InputsValue {
  inputs: InputState
  patch: <T extends Tool>(tool: T, values: Partial<InputState[T]>) => void
  clear: (tool: Tool) => void
  /** In-memory only: fetched results that should survive navigation, not restarts. */
  results: React.MutableRefObject<Partial<Record<Tool, unknown>>>
  resultVersion: number
  setResult: (tool: Tool, value: unknown) => void
}

const InputsContext = createContext<InputsValue | null>(null)

export function InputsProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<InputState>(load)
  const results = useRef<Partial<Record<Tool, unknown>>>({})
  const [resultVersion, setResultVersion] = useState(0)

  const persist = useCallback((next: InputState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage being unavailable must not break typing.
    }
  }, [])

  const patch = useCallback<InputsValue['patch']>(
    (tool, values) => {
      setInputs((prev) => {
        const next = { ...prev, [tool]: { ...prev[tool], ...values } }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const clear = useCallback(
    (tool: Tool) => {
      results.current[tool] = undefined
      setResultVersion((v) => v + 1)
      setInputs((prev) => {
        const next = { ...prev, [tool]: EMPTY[tool] }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setResult = useCallback((tool: Tool, value: unknown) => {
    results.current[tool] = value
    setResultVersion((v) => v + 1)
  }, [])

  const value = useMemo(
    () => ({ inputs, patch, clear, results, resultVersion, setResult }),
    [inputs, patch, clear, resultVersion, setResult],
  )

  return <InputsContext.Provider value={value}>{children}</InputsContext.Provider>
}

function useInputsContext() {
  const ctx = useContext(InputsContext)
  if (!ctx) throw new Error('useToolInputs must be used inside InputsProvider')
  return ctx
}

/**
 * Read and write one tool's inputs.
 *
 * `result` is whatever the tool last produced — formats, a report — and is kept
 * across navigation but not across restarts.
 */
export function useToolInputs<T extends Tool, R = unknown>(tool: T) {
  const { inputs, patch, clear, results, resultVersion, setResult } = useInputsContext()

  return useMemo(
    () => ({
      values: inputs[tool],
      set: (values: Partial<InputState[T]>) => patch(tool, values),
      clear: () => clear(tool),
      result: results.current[tool] as R | undefined,
      setResult: (value: R | undefined) => setResult(tool, value),
    }),
    // resultVersion is what makes a result change re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputs, tool, patch, clear, setResult, resultVersion],
  )
}
