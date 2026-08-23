import { useCallback, useState } from 'react'
import { trimVideo, cropVideo } from '../lib/backend'
import type { TrimOptions, CropOptions, LogScope } from '../lib/backend'
import { useLogs } from '../state/logs'

export interface EditOpState {
  status: 'idle' | 'running' | 'done' | 'failed'
  percent: number
  message: string
  outputPath?: string
}

const IDLE: EditOpState = { status: 'idle', percent: 0, message: '' }

/** Generic hook that drives either a trim or crop streaming operation. */
export function useEditOp(scope: LogScope = 'edit') {
  const [state, setState] = useState<EditOpState>(IDLE)
  const { log } = useLogs()

  const reset = useCallback(() => setState(IDLE), [])

  const runTrim = useCallback(
    async (options: TrimOptions) => {
      setState({ status: 'running', percent: 0, message: 'Starting trim…' })
      log(scope, `Trimming ${options.start_time} → ${options.end_time}`)
      try {
        for await (const event of trimVideo(options)) {
          switch (event.type) {
            case 'status':
              setState((s) => ({ ...s, message: event.message }))
              log(scope, event.message)
              break
            case 'progress':
              setState((s) => ({ ...s, percent: event.percent }))
              break
            case 'complete':
              setState({ status: 'done', percent: 100, message: 'Saved', outputPath: event.output_path })
              log(scope, `Saved ${event.output_path}`)
              return
            case 'error':
              setState({ status: 'failed', percent: 0, message: event.message })
              log(scope, event.message, 'error')
              return
          }
        }
        setState((s) =>
          s.status === 'running'
            ? { status: 'failed', percent: 0, message: 'Operation ended unexpectedly.' }
            : s,
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Trim failed.'
        setState({ status: 'failed', percent: 0, message })
        log(scope, message, 'error')
      }
    },
    [log, scope],
  )

  const runCrop = useCallback(
    async (options: CropOptions) => {
      setState({ status: 'running', percent: 0, message: 'Starting crop…' })
      log(scope, `Cropping to ${options.width}×${options.height} at (${options.x}, ${options.y})`)
      try {
        for await (const event of cropVideo(options)) {
          switch (event.type) {
            case 'status':
              setState((s) => ({ ...s, message: event.message }))
              log(scope, event.message)
              break
            case 'progress':
              setState((s) => ({ ...s, percent: event.percent }))
              break
            case 'complete':
              setState({ status: 'done', percent: 100, message: 'Saved', outputPath: event.output_path })
              log(scope, `Saved ${event.output_path}`)
              return
            case 'error':
              setState({ status: 'failed', percent: 0, message: event.message })
              log(scope, event.message, 'error')
              return
          }
        }
        setState((s) =>
          s.status === 'running'
            ? { status: 'failed', percent: 0, message: 'Operation ended unexpectedly.' }
            : s,
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Crop failed.'
        setState({ status: 'failed', percent: 0, message })
        log(scope, message, 'error')
      }
    },
    [log, scope],
  )

  return { state, runTrim, runCrop, reset }
}
