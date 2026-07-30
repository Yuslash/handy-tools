import { useCallback, useState } from 'react'
import { convertToGif } from '../lib/backend'
import type { GifOptions, LogScope } from '../lib/backend'
import { useLogs } from '../state/logs'

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
export function useGifConvert(scope: LogScope = 'gif') {
  const [state, setState] = useState<GifState>(IDLE)
  const { log } = useLogs()

  const reset = useCallback(() => setState(IDLE), [])

  const convert = useCallback(
    async (options: GifOptions) => {
      setState({ status: 'converting', percent: 0, message: 'Starting…' })
      log(scope, `Converting to GIF at ${options.fps} fps, ${options.width}px wide`)
      if (options.start_time || options.end_time) {
        log(scope, `Trimming ${options.start_time ?? 'start'} → ${options.end_time ?? 'end'}`)
      }

      try {
        for await (const event of convertToGif(options)) {
          switch (event.type) {
            case 'status':
              setState((s) => ({ ...s, message: event.message }))
              log(scope, event.message)
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
              log(scope, `Saved ${event.output_path}`)
              return
            case 'error':
              setState({ status: 'failed', percent: 0, message: event.message })
              log(scope, event.message, 'error')
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
        const message = e instanceof Error ? e.message : 'Conversion failed.'
        setState({ status: 'failed', percent: 0, message })
        log(scope, message, 'error')
      }
    },
    [log, scope],
  )

  return { state, convert, reset }
}
