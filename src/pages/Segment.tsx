import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { Page } from '../components/Page'
import { UrlField } from '../components/UrlField'
import { TimeRange, parseTimecode } from '../components/TimeRange'
import { GifPanel } from '../components/GifPanel'
import { TransferReadout } from '../components/TransferReadout'
import { Button } from '../components/ui/Button'
import { useTransfers, useTransfer } from '../state/transfers'
import { useGifConvert } from '../hooks/useGifConvert'
import { useToolLog } from '../state/logs'

/** Download only a chosen range of a long video, instead of the whole thing. */
export function Segment() {
  const [url, setUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)

  const { start: beginTransfer, connected } = useTransfers()
  const transfer = useTransfer(transferId)
  const gif = useGifConvert('segment')
  const log = useToolLog('segment')

  const startSec = parseTimecode(start)
  const endSec = parseTimecode(end)
  const rangeInvalid = startSec !== null && endSec !== null && endSec <= startSec
  const ready = Boolean(url.trim()) && startSec !== null && endSec !== null && !rangeInvalid

  const download = () => {
    if (!ready) {
      setError('Enter a URL and a start and end time.')
      return
    }

    setError('')
    gif.reset()
    log.info(`Requesting ${start.trim()} → ${end.trim()} (${Math.round((endSec ?? 0) - (startSec ?? 0))}s)`)

    const id = beginTransfer({
      url: url.trim(),
      formatId: 'bestvideo+bestaudio',
      startTime: start.trim(),
      endTime: end.trim(),
      scope: 'segment',
      source: 'Segment',
      label: `Segment ${start.trim()}–${end.trim()}`,
    })
    if (id) setTransferId(id)
    else setError('Lost the connection to the backend. It should reconnect shortly.')
  }

  const busy = transfer?.status === 'downloading' || transfer?.status === 'merging'

  return (
    <Page scope="segment" title="Segment" description="Cut a specific range out of a long video without downloading all of it.">
      <div className="space-y-6">
        {/* No button here — the action lives with the range, below. */}
        <UrlField value={url} onChange={setUrl} onSubmit={download} />

        <div className="panel space-y-4 p-4">
          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} invalid={rangeInvalid} />

          <div className="flex items-center justify-between border-t border-line pt-4">
            <p className="font-mono text-data text-ink-faint">
              {startSec !== null && endSec !== null && !rangeInvalid
                ? `Length ${Math.round(endSec - startSec)}s`
                : 'Set a start and end time'}
            </p>

            <Button variant="primary" onClick={download} disabled={!ready || busy || !connected}>
              <Crosshair size={14} />
              {busy ? 'Downloading' : 'Download range'}
            </Button>
          </div>
        </div>

        {error && <p className="text-body text-bad">{error}</p>}

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
