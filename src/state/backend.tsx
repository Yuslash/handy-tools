import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { setBackendPort } from '../lib/backend'
import type { BackendStatus } from '../lib/backend'

const BackendContext = createContext<BackendStatus>({ state: 'starting' })

/**
 * Mirrors the main process's view of the Python backend, so the UI can report
 * "starting" / "ready" / why it failed instead of leaving dead buttons.
 */
export function BackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>({ state: 'starting' })

  useEffect(() => {
    const apply = (next: BackendStatus) => {
      if (next.state === 'ready') setBackendPort(next.port)
      setStatus(next)
    }

    window.bench?.getBackendStatus().then(apply).catch(() => {
      setStatus({ state: 'failed', reason: 'Not running inside the desktop app.' })
    })

    return window.bench?.onBackendStatus(apply)
  }, [])

  return <BackendContext.Provider value={status}>{children}</BackendContext.Provider>
}

export const useBackend = () => useContext(BackendContext)
