import { useState } from 'react'
import { Scissors } from 'lucide-react'
import { Page } from '../components/Page'
import { UrlField } from '../components/UrlField'
import { GifPanel } from '../components/GifPanel'
import { TransferReadout } from '../components/TransferReadout'
import { useTransfers, useTransfer } from '../state/transfers'
import { useGifConvert } from '../hooks/useGifConvert'
import { useToolLog } from '../state/logs'

/**
 * YouTube renders clips at a reduced quality. The backend detects a /clip/ URL,
 * resolves the parent video, and downloads that range at full resolution.
 */
export function Clip() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)

  const { start, connected } = useTransfers()
  const transfer = useTransfer(transferId)
  const gif = useGifConvert('clip')
  const log = useToolLog('clip')

  const download = () => {
    const trimmed = url.trim()
    if (!trimmed.includes('/clip/')) {
      const message = 'That doesn’t look like a YouTube clip link. Clip URLs contain “/clip/”.'
      setError(message)
      log.error(message)
      return
    }

    setError('')
    gif.reset()
    log.info(`Resolving clip ${trimmed}`)
    log.info('Switching to the source video to get full resolution')

    const id = start({
      url: trimmed,
      formatId: 'bestvideo+bestaudio',
      source: 'Clip',
      label: 'YouTube clip',
      scope: 'clip',
    })
    if (id) setTransferId(id)
    else setError('Lost the connection to the backend. It should reconnect shortly.')
  }

  return (
    <Page
      scope="clip"
      title="Clip"
      description="Download a YouTube clip at the source video’s full quality, not the clip’s reduced render."
    >
      <div className="space-y-6">
        <UrlField
          value={url}
          onChange={setUrl}
          onSubmit={download}
          busy={transfer?.status === 'downloading' || transfer?.status === 'merging'}
          action="Download clip"
          busyLabel="Downloading"
          placeholder="https://www.youtube.com/clip/…"
          disabled={!connected}
        />

        {error && <p className="text-body text-bad">{error}</p>}

        {!transfer && !error && (
          <div className="panel flex items-start gap-3 p-4">
            <Scissors size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            <p className="text-small leading-relaxed text-ink-dim">
              Open a clip on YouTube and copy the address. Bench finds the original video and
              downloads just that range, so you get the full resolution the clip was cut from.
            </p>
          </div>
        )}

        {transfer && <TransferReadout transfer={transfer} />}

        {transfer?.status === 'done' && transfer.filePath && (
          <GifPanel
            state={gif.state}
            onReset={gif.reset}
            onConvert={() => gif.convert({ file_path: transfer.filePath!, fps: 15, width: 480 })}
          />
        )}
      </div>
    </Page>
  )
}
