import { NavLink } from 'react-router-dom'
import { Download, Scissors, Crosshair, Gauge, Film, FolderOpen, Clapperboard, Radio } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import { TransfersStrip } from './TransfersStrip'

interface Tool {
  to: string
  icon: LucideIcon
  name: string
  /** What the tool does, in the user's terms. */
  blurb: string
}

export const tools: Tool[] = [
  { to: '/', icon: Download, name: 'Download', blurb: 'Save a video or its audio' },
  { to: '/record', icon: Radio, name: 'Screen Record', blurb: 'Record screen & make a GIF' },
  { to: '/clip', icon: Scissors, name: 'Clip', blurb: 'Full quality from a YouTube clip' },
  { to: '/segment', icon: Crosshair, name: 'Segment', blurb: 'Cut a range from a long video' },
  { to: '/inspect', icon: Gauge, name: 'Inspect', blurb: 'Check if a file is really 4K' },
  { to: '/gif', icon: Film, name: 'GIF', blurb: 'Turn a video into a GIF' },
  { to: '/edit', icon: Clapperboard, name: 'Edit', blurb: 'Trim and crop a local video' },
]

export function Rail() {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-bg">
      <ul className="space-y-0.5 p-2">
        {tools.map(({ to, icon: Icon, name, blurb }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              title={blurb}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body transition-colors duration-100',
                  isActive
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-dim hover:bg-raised/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-signal' : 'text-ink-faint'} />
                  {name}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <TransfersStrip />

      <button
        onClick={() => window.bench.openDownloads()}
        className="m-2 flex items-center gap-2 rounded-md px-2.5 py-2 text-small text-ink-dim transition-colors hover:bg-raised hover:text-ink"
      >
        <FolderOpen size={14} className="text-ink-faint" />
        Open Downloads
      </button>
    </nav>
  )
}
