import { useMemo } from 'react'
import type { Format } from '../lib/backend'
import { cn } from '../lib/utils'

/**
 * The format ladder.
 *
 * The backend has always returned the full format list; the old UI fetched it
 * and rendered two hardcoded buttons instead. Here each rung is a real format:
 * bar width encodes filesize, so the quality/size tradeoff is visible rather
 * than something you have to reason about.
 */

export interface LadderChoice {
  formatId: string
  audioOnly: boolean
  label: string
}

interface Props {
  formats: Format[]
  selected: LadderChoice | null
  onSelect: (choice: LadderChoice) => void
  ffmpegAvailable: boolean
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function heightOf(resolution: string): number {
  const m = /x(\d+)/.exec(resolution)
  return m ? Number(m[1]) : 0
}

/** 2160 → "4K", 1080 → "1080p". The name people actually use. */
function tierLabel(height: number): string {
  if (height >= 4320) return '8K'
  if (height >= 2160) return '4K'
  if (height >= 1440) return '1440p'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  if (height > 0) return `${height}p`
  return '—'
}

function shortCodec(codec: string): string {
  if (!codec || codec === 'none') return '—'
  const c = codec.toLowerCase()
  if (c.startsWith('avc')) return 'h264'
  if (c.startsWith('hev') || c.startsWith('hvc')) return 'h265'
  if (c.startsWith('av01')) return 'av1'
  if (c.startsWith('vp9') || c.startsWith('vp09')) return 'vp9'
  if (c.startsWith('mp4a')) return 'aac'
  return c.split('.')[0]
}

interface Rung {
  key: string
  formatId: string
  audioOnly: boolean
  tier: string
  codec: string
  ext: string
  size: number
  label: string
}

export function FormatLadder({ formats, selected, onSelect, ffmpegAvailable }: Props) {
  const { video, audio } = useMemo(() => {
    // One rung per resolution tier — the largest file at that tier, which is the
    // best-quality stream. A raw list of 40 yt-dlp formats is noise, not choice.
    const byTier = new Map<number, Format>()
    for (const f of formats) {
      if (f.vcodec === 'none') continue
      const h = heightOf(f.resolution)
      if (!h) continue
      const existing = byTier.get(h)
      if (!existing || (f.size || 0) > (existing.size || 0)) byTier.set(h, f)
    }

    const video: Rung[] = [...byTier.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([h, f]) => ({
        key: `v-${f.id}`,
        // Video-only streams need an audio track merged in.
        formatId: f.acodec === 'none' ? `${f.id}+bestaudio/best` : f.id,
        audioOnly: false,
        tier: tierLabel(h),
        codec: shortCodec(f.vcodec),
        ext: f.ext,
        size: f.size || 0,
        label: `${tierLabel(h)} ${shortCodec(f.vcodec)}`,
      }))

    const bestAudio = formats
      .filter((f) => f.vcodec === 'none' && f.acodec !== 'none')
      .sort((a, b) => (b.size || 0) - (a.size || 0))[0]

    const audio: Rung | null = bestAudio
      ? {
          key: 'a',
          formatId: 'bestaudio/best',
          audioOnly: true,
          tier: 'Audio',
          codec: shortCodec(bestAudio.acodec),
          ext: ffmpegAvailable ? 'mp3' : bestAudio.ext,
          size: bestAudio.size || 0,
          label: 'Audio only',
        }
      : null

    return { video, audio }
  }, [formats, ffmpegAvailable])

  const maxSize = Math.max(...video.map((r) => r.size), audio?.size ?? 0, 1)

  if (video.length === 0 && !audio) {
    return <p className="text-[13px] text-ink-dim">No downloadable formats were found for this URL.</p>
  }

  const renderRung = (rung: Rung, index: number) => {
    const isSelected = selected?.formatId === rung.formatId
    // Square-root scale. Linear collapses everything below ~480p into identical
    // stubs when the top rung is a 1.3 GB 4K file; sqrt keeps the ordering and
    // the "4K is much bigger" read while leaving the small end legible.
    const widthPct = Math.max(3, Math.sqrt(rung.size / maxSize) * 100)

    return (
      <button
        key={rung.key}
        type="button"
        onClick={() => onSelect({ formatId: rung.formatId, audioOnly: rung.audioOnly, label: rung.label })}
        aria-pressed={isSelected}
        style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
        className={cn(
          'animate-rung-in group relative grid w-full grid-cols-[3.5rem_3rem_1fr_4.5rem] items-center gap-3',
          'rounded-md border px-3 py-2 text-left transition-colors duration-100',
          isSelected
            ? 'border-signal bg-signal/10'
            : 'border-transparent hover:border-rule-bright hover:bg-raised',
        )}
      >
        <span
          className={cn(
            'font-mono text-[13px] font-medium tabular-nums',
            isSelected ? 'text-signal' : 'text-ink',
          )}
        >
          {rung.tier}
        </span>

        <span className="font-mono text-[11px] text-ink-faint">{rung.codec}</span>

        {/* Bar length is filesize. This is the whole point of the ladder. */}
        <span className="flex h-1.5 items-center overflow-hidden rounded-full bg-surround">
          <span
            className={cn(
              'h-full rounded-full transition-colors duration-100',
              isSelected ? 'bg-signal' : 'bg-rule-bright group-hover:bg-ink-faint',
            )}
            style={{ width: `${widthPct}%` }}
          />
        </span>

        <span className="text-right font-mono text-[11px] tabular-nums text-ink-dim">
          {formatSize(rung.size)}
        </span>
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="label">Format</span>
        <span className="label">Bar length = file size</span>
      </div>

      <div className="space-y-0.5">{video.map(renderRung)}</div>

      {audio && (
        <>
          <div className="h-px bg-rule" />
          <div className="space-y-0.5">{renderRung(audio, video.length)}</div>
        </>
      )}

      {!ffmpegAvailable && (
        <p className="text-[12px] text-fault">
          ffmpeg isn't installed, so video and audio can't be combined. Only pre-merged formats will work.
        </p>
      )}
    </div>
  )
}
