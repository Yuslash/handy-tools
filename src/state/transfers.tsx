import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { wsUrl } from '../lib/backend'

/**
 * All download state lives here rather than inside a page.
 *
 * Previously each tool owned its own `downloadState` and its own WebSocket, so
 * navigating away mid-download destroyed the progress UI and dropped the socket.
 * One connection, one list, shared by every tool.
 */

export type TransferStatus = 'queued' | 'downloading' | 'merging' | 'done' | 'failed'

export interface Transfer {
  id: string
  /** Which tool started it — shown in the transfers rail. */
  source: string
  label: string
  status: TransferStatus
  percent: number
  speed?: string
  eta?: string
  filePath?: string
  error?: string
  note?: string
  startedAt: number
}

export interface DownloadRequest {
  url: string
  formatId?: string | null
  audioOnly?: boolean
  startTime?: string
  endTime?: string
  outputDir?: string
  source: string
  label: string
}

interface TransfersValue {
  transfers: Transfer[]
  active: Transfer | undefined
  connected: boolean
  /** Resolves with the transfer id; watch `transfers` for its progress. */
  start: (request: DownloadRequest) => string | null
  clearFinished: () => void
  dismiss: (id: string) => void
}

const TransfersContext = createContext<TransfersValue | null>(null)

export function TransfersProvider({ children }: { children: ReactNode }) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [connected, setConnected] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const currentId = useRef<string | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closed = useRef(false)

  const update = useCallback((id: string, patch: Partial<Transfer>) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  useEffect(() => {
    closed.current = false

    // The backend may still be starting when the window opens, so reconnect
    // rather than failing silently forever the way the old pages did.
    const connect = () => {
      if (closed.current) return

      const ws = new WebSocket(wsUrl())
      socket.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        const id = currentId.current
        if (!id) return

        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        switch (msg.type) {
          case 'info':
            // The backend sends these; the old UI dropped every one.
            update(id, {
              note: String(msg.message ?? ''),
              ...(String(msg.message ?? '').startsWith('Merging') ? { status: 'merging' as const } : {}),
            })
            break
          case 'progress':
            update(id, {
              status: 'downloading',
              percent: parseFloat(String(msg.percent ?? '0').replace('%', '')) || 0,
              speed: msg.speed ? String(msg.speed) : undefined,
              eta: msg.eta ? String(msg.eta) : undefined,
            })
            break
          case 'finished_file':
            update(id, { filePath: String(msg.file_path ?? '') })
            break
          case 'complete':
            update(id, { status: 'done', percent: 100, note: undefined })
            currentId.current = null
            break
          case 'error':
            update(id, { status: 'failed', error: String(msg.message ?? 'Download failed.') })
            currentId.current = null
            break
        }
      }

      ws.onclose = () => {
        setConnected(false)
        socket.current = null
        if (!closed.current) {
          retryTimer.current = setTimeout(connect, 1500)
        }
      }

      // onclose always follows, which is where the retry is scheduled.
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      closed.current = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
      socket.current?.close()
    }
  }, [update])

  const start = useCallback((request: DownloadRequest): string | null => {
    const ws = socket.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return null

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    currentId.current = id

    setTransfers((prev) => [
      {
        id,
        source: request.source,
        label: request.label,
        status: 'downloading',
        percent: 0,
        startedAt: Date.now(),
      },
      ...prev,
    ])

    ws.send(
      JSON.stringify({
        action: 'download',
        url: request.url,
        format_id: request.formatId ?? null,
        audio_only: request.audioOnly ?? false,
        start_time: request.startTime,
        end_time: request.endTime,
        output_dir: request.outputDir,
      }),
    )

    return id
  }, [])

  const clearFinished = useCallback(() => {
    setTransfers((prev) => prev.filter((t) => t.status === 'downloading' || t.status === 'merging'))
  }, [])

  const dismiss = useCallback((id: string) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(
    () => ({
      transfers,
      active: transfers.find((t) => t.status === 'downloading' || t.status === 'merging'),
      connected,
      start,
      clearFinished,
      dismiss,
    }),
    [transfers, connected, start, clearFinished, dismiss],
  )

  return <TransfersContext.Provider value={value}>{children}</TransfersContext.Provider>
}

export function useTransfers() {
  const ctx = useContext(TransfersContext)
  if (!ctx) throw new Error('useTransfers must be used inside TransfersProvider')
  return ctx
}

/** Track one transfer by id, for a tool that started it. */
export function useTransfer(id: string | null) {
  const { transfers } = useTransfers()
  return id ? transfers.find((t) => t.id === id) : undefined
}
