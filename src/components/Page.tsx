import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useBackend } from '../state/backend'

/**
 * Shared frame for every tool: a title, a one-line description of what the tool
 * does, and a gate that explains itself when the backend isn't up — instead of
 * leaving controls that silently do nothing.
 */
export function Page({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const backend = useBackend()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-7">
        <header className="mb-6">
          <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1 text-[13px] text-ink-dim">{description}</p>
        </header>

        {backend.state === 'ready' ? (
          children
        ) : (
          <BackendGate
            starting={backend.state === 'starting'}
            reason={backend.state === 'failed' ? backend.reason : ''}
          />
        )}
      </div>
    </div>
  )
}

function BackendGate({ starting, reason }: { starting: boolean; reason: string }) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      {starting ? (
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-signal" />
      ) : (
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-fault" />
      )}
      <div>
        <p className="text-[13px] font-medium text-ink">
          {starting ? 'Starting the backend…' : 'The backend isn’t running'}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
          {starting
            ? 'This takes a few seconds on first launch. Tools become available as soon as it answers.'
            : reason || 'Downloads and conversions are unavailable until it starts.'}
        </p>
      </div>
    </div>
  )
}
