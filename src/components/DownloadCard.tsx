import { CheckCircle, AlertTriangle, ArrowUp, Zap } from "lucide-react"

interface DownloadState {
    status: 'idle' | 'downloading' | 'completed' | 'error'
    percent: number
    speed: string
    eta: string
    error?: string
}

export function DownloadCard({ state }: { state: DownloadState, title?: string }) {
    if (state.status === 'idle') return null

    return (
        <div className="w-full mt-4 animate-in fade-in slide-in-from-bottom-2">

            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500">
                    {state.status === 'downloading' && (
                        <span className="flex items-center gap-1.5 text-[#ccff00]">
                            <Zap size={10} className="fill-current" />
                            ACTIVE STREAM
                        </span>
                    )}
                    {state.status === 'completed' && (
                        <span className="flex items-center gap-1.5 text-green-400">
                            <CheckCircle size={10} />
                            TRANSMISSION COMPLETE
                        </span>
                    )}
                    {state.status === 'error' && (
                        <span className="flex items-center gap-1.5 text-red-500">
                            <AlertTriangle size={10} />
                            CONNECTION REFUSED
                        </span>
                    )}
                </div>
                <div className="text-xs font-mono text-white">
                    {state.percent.toFixed(1)}%
                </div>
            </div>

            {/* Linear Progress */}
            <div className="h-1 w-full bg-white/10 overflow-hidden relative">
                <div
                    className={`absolute top-0 left-0 h-full transition-all duration-300 ease-linear ${state.status === 'error' ? 'bg-red-500' : (state.status === 'completed' ? 'bg-green-400' : 'bg-[#ccff00]')}`}
                    style={{ width: `${state.percent}%` }}
                />
                {state.status === 'downloading' && (
                    <div className="absolute inset-0 bg-white/50 w-full animate-[shimmer_1s_infinite] skew-x-12 opacity-20" />
                )}
            </div>

            <div className="flex justify-between items-center mt-2 text-[10px] font-mono uppercase text-zinc-600">
                {state.status === 'downloading' && (
                    <>
                        <span className="flex items-center gap-1"><ArrowUp size={8} /> {state.speed}</span>
                        <span>ETA: {state.eta}</span>
                    </>
                )}

                {state.status === 'completed' && (
                    <span className="text-zinc-500">Resource saved to local directory</span>
                )}

                {state.status === 'error' && (
                    <span className="text-red-500/80">{state.error}</span>
                )}
            </div>
        </div>
    )
}
