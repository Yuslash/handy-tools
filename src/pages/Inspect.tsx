import { useState } from 'react'
import { FileVideo, Loader2 } from 'lucide-react'
import { Page } from '../components/Page'
import { Button } from '../components/ui/Button'
import { checkQuality } from '../lib/backend'
import type { QualityReport } from '../lib/backend'
import { cn } from '../lib/utils'
import { useToolLog } from '../state/logs'

/**
 * Measures a file rather than trusting its label: resolution and bitrate from
 * ffprobe, plus an OpenCV sharpness score that exposes upscaled "4K".
 *
 * No timeline here — for a static file inspection it would be decoration.
 */
export function Inspect() {
  const [path, setPath] = useState('')
  const [report, setReport] = useState<QualityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const log = useToolLog('inspect')

  const choose = async () => {
    const chosen = await window.bench.selectFile()
    if (!chosen) return

    setPath(chosen)
    setReport(null)
    setError('')
    setLoading(true)
    log.info(`Inspecting ${chosen}`)

    try {
      const result = await checkQuality(chosen)
      setReport(result)
      log.info(`${result.resolution} ${result.codec} · ${result.bitrate_kbps} kb/s · ${result.fps.toFixed(2)} fps`)
      log.info(`Sharpness ${result.sharpness_score.toFixed(1)} — ${result.is_true_native ? 'native resolution' : 'likely upscaled'}`)
      for (const w of result.warnings) log.error(w)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read that file.'
      setError(message)
      log.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Page scope="inspect" title="Inspect" description="Measure a video file’s real resolution and detect upscaled footage.">
      <div className="space-y-6">
        <div className="flex gap-2">
          <div className="field flex flex-1 items-center overflow-hidden">
            <span className={cn('truncate', !path && 'text-ink-faint')}>
              {path || 'No file chosen'}
            </span>
          </div>
          <Button variant="primary" onClick={choose} disabled={loading} className="shrink-0">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <FileVideo size={14} />}
            {loading ? 'Reading' : 'Choose file'}
          </Button>
        </div>

        {error && <p className="text-body text-bad">{error}</p>}

        {report && <Report report={report} />}
      </div>
    </Page>
  )
}

function Report({ report }: { report: QualityReport }) {
  const rows: Array<[string, string]> = [
    ['Resolution', report.resolution],
    ['Class', report.quality_label],
    ['Codec', report.codec],
    ['Frame rate', report.fps ? `${report.fps.toFixed(2)} fps` : '—'],
    ['Bitrate', report.bitrate_kbps ? `${report.bitrate_kbps.toLocaleString()} kb/s` : '—'],
    ['Sharpness', report.sharpness_score.toFixed(1)],
  ]

  return (
    <div className="animate-lift-in space-y-4">
      <div
        className={cn(
          'panel flex items-center gap-3 p-4',
          report.is_true_native ? 'border-ok/40' : 'border-bad/40',
        )}
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', report.is_true_native ? 'bg-ok' : 'bg-bad')}
        />
        <div>
          <p className="text-section font-medium text-ink">
            {report.is_true_native ? 'Native resolution' : 'Likely upscaled'}
          </p>
          <p className="mt-0.5 text-small text-ink-dim">
            {report.is_true_native
              ? 'The detail in this file matches the resolution it reports.'
              : 'The detail is lower than the resolution suggests, so this was probably enlarged from a smaller source.'}
          </p>
        </div>
      </div>

      <div className="panel divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5">
            <span className="label">{label}</span>
            <span className="font-mono text-small tabular-nums text-ink">{value}</span>
          </div>
        ))}
      </div>

      {report.warnings.length > 0 && (
        <ul className="space-y-1">
          {report.warnings.map((w) => (
            <li key={w} className="text-small text-bad">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
