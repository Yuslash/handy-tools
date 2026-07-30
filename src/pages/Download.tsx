import { useState } from 'react'
import { Download as DownloadIcon } from 'lucide-react'
import { Page } from '../components/Page'
import { UrlField } from '../components/UrlField'
import { FormatLadder } from '../components/FormatLadder'
import type { LadderChoice } from '../components/FormatLadder'
import { GifPanel } from '../components/GifPanel'
import { Button } from '../components/ui/Button'
import { TransferReadout } from '../components/TransferReadout'
import { fetchVideoInfo } from '../lib/backend'
import type { VideoInfo } from '../lib/backend'
import { useTransfers, useTransfer } from '../state/transfers'
import { useGifConvert } from '../hooks/useGifConvert'
import { useToolLog } from '../state/logs'

export function Download() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [choice, setChoice] = useState<LadderChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)

  const { start, connected } = useTransfers()
  const transfer = useTransfer(transferId)
  const gif = useGifConvert('download')
  const log = useToolLog('download')

  const analyse = async () => {
    setLoading(true)
    setError('')
    setInfo(null)
    setChoice(null)
    setTransferId(null)
    gif.reset()

    log.info(`Fetching formats for ${url.trim()}`)
    try {
      const result = await fetchVideoInfo(url.trim())
      setInfo(result)
      log.info(`Found "${result.title}" by ${result.uploader}`)
      log.info(`${result.formats.length} formats available · ffmpeg ${result.ffmpeg_available ? 'yes' : 'no'}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read that URL.'
      setError(message)
      log.error(message)
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!choice || !info) return
    gif.reset()
    log.info(`Starting download: ${choice.label}`)
    const id = start({
      url: url.trim(),
      formatId: choice.formatId,
      audioOnly: choice.audioOnly,
      source: 'Download',
      label: info.title,
      scope: 'download',
    })
    if (id) {
      setTransferId(id)
    } else {
      const message = 'Lost the connection to the backend. It should reconnect shortly.'
      setError(message)
      log.error(message)
    }
  }

  return (
    <Page
      title="Download"
      description="Save a video, or pull just its audio, from a link."
      scope="download"
    >
      <div className="space-y-6">
        <UrlField
          value={url}
          onChange={setUrl}
          onSubmit={analyse}
          busy={loading}
          action="Fetch formats"
          busyLabel="Fetching"
        />

        {error && <p className="text-body text-bad">{error}</p>}

        {info && (
          <div className="animate-lift-in space-y-6">
            <div className="flex gap-4">
              {info.thumbnail && (
                <img
                  src={info.thumbnail}
                  alt=""
                  className="h-[72px] w-32 shrink-0 rounded-md border border-line object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-section font-medium leading-snug text-ink">
                  {info.title}
                </h2>
                <p className="mt-1 font-mono text-data text-ink-faint">
                  {[info.uploader, info.duration && `${info.duration}s`].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            <div className="panel p-4">
              <FormatLadder
                formats={info.formats}
                selected={choice}
                onSelect={setChoice}
                ffmpegAvailable={info.ffmpeg_available}
              />

              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <p className="text-small text-ink-faint">
                  {choice ? `Selected ${choice.label}` : 'Pick a format to continue'}
                </p>
                <Button
                  variant="primary"
                  disabled={!choice || !connected || transfer?.status === 'downloading'}
                  onClick={download}
                >
                  <DownloadIcon size={14} />
                  Download
                </Button>
              </div>
            </div>

            {transfer && <TransferReadout transfer={transfer} />}

            {transfer?.status === 'done' && transfer.filePath && !choice?.audioOnly && (
              <GifPanel
                state={gif.state}
                onReset={gif.reset}
                onConvert={() =>
                  gif.convert({ file_path: transfer.filePath!, fps: 15, width: 480 })
                }
              />
            )}
          </div>
        )}
      </div>
    </Page>
  )
}
