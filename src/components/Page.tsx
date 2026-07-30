import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useBackend } from '../state/backend'
import { LogPanel } from './LogPanel'
import type { LogScope } from '../lib/backend'

/**
 * Shared frame for every tool: a title, a one-line description of what the tool
 * does, and a gate that explains itself when the backend isn't up — instead of
 * leaving controls that silently do nothing.
 */
export function Page({
  title,
  description,
  scope,
  children,
}: {
  title: string
  description: string
  /** Which log this screen shows. Each tool sees only its own events. */
  scope: LogScope
  children: ReactNode
}) {
  const backend = useBackend()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-180 px-8 py-8">
        <header className="mb-6">
          <h1 className="font-display text-title font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-body text-ink-dim">{description}</p>
        </header>

        {backend.state === 'ready' ? (
          <>
            {children}
            {/* Collapsed once things work, but always one click away. */}
            <div className="mt-8">
              <LogPanel scope={scope} />
            </div>
          </>
        ) : (
          <BackendGate
            scope={scope}
            starting={backend.state === 'starting'}
            reason={backend.state === 'failed' ? backend.reason : ''}
          />
        )}
      </div>
    </div>
  )
}

function BackendGate({
  scope,
  starting,
  reason,
}: {
  scope: LogScope
  starting: boolean
  reason: string
}) {
  return (
    <div className="space-y-4">
      <div className="panel flex items-start gap-3 p-4">
        {starting ? (
          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-signal" />
        ) : (
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
        )}
        <div>
          <p className="text-body font-medium text-ink">
            {starting ? 'Starting the backend…' : 'The backend isn’t running'}
          </p>
          <p className="mt-1 text-small leading-relaxed text-ink-dim">
            {starting
              ? 'The first launch unpacks the backend, which can take up to a minute. Tools become available as soon as it answers.'
              : reason || 'Downloads and conversions are unavailable until it starts.'}
          </p>
        </div>
      </div>

      {/* Open by default here: if you are looking at this panel, you want the detail. */}
      <LogPanel scope={scope} defaultOpen />
    </div>
  )
}
