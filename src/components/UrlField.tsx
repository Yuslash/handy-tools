import { Loader2 } from 'lucide-react'
import { Button } from './ui/Button'

/** URL input plus its primary action. Shared by the download, clip and segment tools. */
export function UrlField({
  value,
  onChange,
  onSubmit,
  busy = false,
  action,
  busyLabel,
  placeholder = 'Paste a video URL',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  busy?: boolean
  /** Omit to render the input alone — for tools whose action lives elsewhere. */
  action?: string
  busyLabel?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2">
      <input
        type="url"
        className="field flex-1"
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy && value.trim()) onSubmit()
        }}
      />
      {action && (
        <Button
          variant="signal"
          onClick={onSubmit}
          disabled={busy || !value.trim() || disabled}
          className="shrink-0"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? (busyLabel ?? action) : action}
        </Button>
      )}
    </div>
  )
}
