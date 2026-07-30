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

export function Download() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [choice, setChoice] = useState<LadderChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)

  const { start, connected } = useTransfers()
  const transfer = useTransfer(transferId)
  const gif = useGifConvert()

  const analyse = async () => {
    setLoading(true)
    setError('')
    setInfo(null)
    setChoice(null)
    setTransferId(null)
    gif.reset()

    try {
      setInfo(await fetchVideoInfo(url.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that URL.')
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!choice || !info) return
    gif.reset()
    const id = start({
      url: url.trim(),
      formatId: choice.formatId,
      audioOnly: choice.audioOnly,
      source: 'Download',
      label: info.title,
    })
    if (id) setTransferId(id)
    else setError('Lost the connection to the backend. It should reconnect shortly.')
  }

  return (
    <Page title="Download" description="Save a video, or pull just its audio, from a link.">
      <div className="space-y-5">
        <UrlField
          value={url}
          onChange={setUrl}
          onSubmit={analyse}
          busy={loading}
          action="Fetch formats"
          busyLabel="Fetching"
        />

        {error && <p className="text-[13px] text-fault">{error}</p>}

        {info && (
          <div className="animate-lift-in space-y-5">
            <div className="flex gap-4">
              {info.thumbnail && (
                <img
                  src={info.thumbnail}
                  alt=""
                  className="h-[72px] w-32 shrink-0 rounded-md border border-rule object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">
                  {info.title}
                </h2>
                <p className="mt-1 font-mono text-[11px] text-ink-faint">
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
            </div>

            <Button
              variant="signal"
              size="lg"
              className="w-full justify-center"
              disabled={!choice || !connected || transfer?.status === 'downloading'}
              onClick={download}
            >
              <DownloadIcon size={14} />
              {choice ? `Download ${choice.label}` : 'Choose a format'}
            </Button>

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
