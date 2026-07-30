/**
 * The single place that knows how to reach the Python backend.
 *
 * The port is discovered from the main process rather than hardcoded, because
 * the backend now picks the first free port instead of always claiming 8000.
 */

export type BackendStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'failed'; reason: string }

/** Which tool a log line belongs to. 'system' is app and backend lifecycle. */
export type LogScope = 'system' | 'download' | 'clip' | 'segment' | 'inspect' | 'gif'

export interface LogLine {
  at: number
  source: 'app' | 'backend'
  level: 'info' | 'error'
  text: string
  scope?: LogScope
}

let port = 8000

export function setBackendPort(p: number) {
  port = p
}

export const httpBase = () => `http://127.0.0.1:${port}`
export const wsUrl = () => `ws://127.0.0.1:${port}/api/ws`

/** Thrown with a message that is safe to show the user as-is. */
export class BackendError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${httpBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new BackendError("Can't reach the backend. It may still be starting.")
  }

  if (!res.ok) {
    // FastAPI puts the useful message in `detail`.
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new BackendError(typeof detail === 'string' ? detail : `Request failed (${res.status}).`)
  }

  return res.json() as Promise<T>
}

export interface Format {
  id: string
  type: 'Video+Audio' | 'Video only' | 'Audio only'
  ext: string
  resolution: string
  size: number
  vcodec: string
  acodec: string
  note: string
  requires_ffmpeg: boolean
  format_note: string
}

export interface VideoInfo {
  title: string
  thumbnail: string
  duration: string
  uploader: string
  formats: Format[]
  ffmpeg_available: boolean
}

export const fetchVideoInfo = (url: string) => post<VideoInfo>('/api/info', { url })

export interface QualityReport {
  filename: string
  resolution: string
  quality_label: string
  fps: number
  codec: string
  bitrate_kbps: number
  sharpness_score: number
  warnings: string[]
  is_true_native: boolean
}

export const checkQuality = (filePath: string) =>
  post<QualityReport>('/api/check_quality', { file_path: filePath })

export interface GifOptions {
  file_path: string
  fps: number
  width: number
  start_time?: string
  end_time?: string
}

export type GifEvent =
  | { type: 'status'; message: string }
  | { type: 'progress'; percent: number; frame?: number }
  | { type: 'complete'; output_path: string }
  | { type: 'error'; message: string }

/**
 * Stream a GIF conversion. Previously this SSE parser was copy-pasted into four
 * pages; it lives here once.
 */
export async function* convertToGif(options: GifOptions): AsyncGenerator<GifEvent> {
  let res: Response
  try {
    res = await fetch(`${httpBase()}/api/convert_gif_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  } catch {
    throw new BackendError("Can't reach the backend. It may still be starting.")
  }

  if (!res.ok || !res.body) {
    throw new BackendError(`Conversion could not start (${res.status}).`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      try {
        yield JSON.parse(trimmed.slice(5)) as GifEvent
      } catch {
        // A partial frame; the next chunk completes it.
      }
    }
  }
}
