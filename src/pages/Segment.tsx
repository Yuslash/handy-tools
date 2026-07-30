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

/** Download only a chosen range of a long video, instead of the whole thing. */
export function Segment() {
  const [url, setUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)

  const { start: beginTransfer, connected } = useTransfers()
  const transfer = useTransfer(transferId)
  const gif = useGifConvert()

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

    const id = beginTransfer({
      url: url.trim(),
      formatId: 'bestvideo+bestaudio',
      startTime: start.trim(),
      endTime: end.trim(),
      source: 'Segment',
      label: `Segment ${start.trim()}–${end.trim()}`,
    })
    if (id) setTransferId(id)
    else setError('Lost the connection to the backend. It should reconnect shortly.')
  }

  const busy = transfer?.status === 'downloading' || transfer?.status === 'merging'

  return (
    <Page title="Segment" description="Cut a specific range out of a long video without downloading all of it.">
      <div className="space-y-5">
        {/* No button here — the action lives with the range, below. */}
        <UrlField value={url} onChange={setUrl} onSubmit={download} />

        <div className="panel space-y-4 p-4">
          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} invalid={rangeInvalid} />

          {startSec !== null && endSec !== null && !rangeInvalid && (
            <p className="font-mono text-[11px] text-ink-faint">
              Length {Math.round(endSec - startSec)}s
            </p>
          )}

          <Button
            variant="signal"
            className="w-full justify-center"
            onClick={download}
            disabled={!ready || busy || !connected}
          >
            <Crosshair size={14} />
            {busy ? 'Downloading' : 'Download this range'}
          </Button>
        </div>

        {error && <p className="text-[13px] text-fault">{error}</p>}

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
