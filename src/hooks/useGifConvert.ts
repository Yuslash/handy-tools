import { useCallback, useState } from 'react'
import { convertToGif } from '../lib/backend'
import type { GifOptions } from '../lib/backend'

export interface GifState {
  status: 'idle' | 'converting' | 'done' | 'failed'
  percent: number
  message: string
  outputPath?: string
}

const IDLE: GifState = { status: 'idle', percent: 0, message: '' }

/**
 * Drives a GIF conversion.
 *
 * The SSE parsing loop this replaces was copy-pasted verbatim into four pages.
 */
export function useGifConvert() {
  const [state, setState] = useState<GifState>(IDLE)

  const reset = useCallback(() => setState(IDLE), [])

  const convert = useCallback(async (options: GifOptions) => {
    setState({ status: 'converting', percent: 0, message: 'Starting…' })

    try {
      for await (const event of convertToGif(options)) {
        switch (event.type) {
          case 'status':
            setState((s) => ({ ...s, message: event.message }))
            break
          case 'progress':
            setState((s) => ({
              ...s,
              percent: event.percent ?? s.percent,
              message: event.frame ? `Frame ${event.frame}` : s.message,
            }))
            break
          case 'complete':
            setState({
              status: 'done',
              percent: 100,
              message: 'Saved',
              outputPath: event.output_path,
            })
            return
          case 'error':
            setState({ status: 'failed', percent: 0, message: event.message })
            return
        }
      }
      // Stream ended without a terminal event.
      setState((s) =>
        s.status === 'converting'
          ? { status: 'failed', percent: 0, message: 'Conversion ended unexpectedly.' }
          : s,
      )
    } catch (e) {
      setState({
        status: 'failed',
        percent: 0,
        message: e instanceof Error ? e.message : 'Conversion failed.',
      })
    }
  }, [])

  return { state, convert, reset }
}
