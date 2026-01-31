import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileVideo, Activity, AlertTriangle, CheckCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'

interface QualityResult {
    filename: string
    resolution: string
    quality_label: string
    fps: number
    codec: string
    bitrate_kbps: number
    sharpness_score: number
    warnings: string[]
    is_true_native: boolean
}

export function VideoQuality({ embedded = false }: { embedded?: boolean }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<QualityResult | null>(null)

    const handleSelectFile = async () => {
        try {
            setLoading(true)
            setError(null)
            setResult(null)

            const filePath = await window.ipcRenderer.invoke('select-file')
            if (!filePath) {
                setLoading(false)
                return
            }

            const response = await fetch('http://localhost:8000/api/check_quality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || 'Failed to analyze video')
            }

            const data = await response.json()
            setResult(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 text-white font-sans">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Quality Analysis</span>
                </div>
                {!embedded && (
                    <Link to="/">
                        <button className="text-zinc-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                            <ArrowLeft size={12} /> Return
                        </button>
                    </Link>
                )}
            </div>

            <div className={`flex-1 overflow-y-auto flex flex-col items-center ${embedded ? 'p-6' : 'p-10'}`}>

                <div className="w-full max-w-2xl flex flex-col gap-8">

                    {/* Intro */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 mb-4">
                            <Activity size={24} />
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Video Quality Inspector</h2>
                        <p className="text-zinc-500 text-sm max-w-md mx-auto">
                            Analyze local video files to detect upscaled content and verify true resolution and bitrate.
                        </p>
                    </div>

                    {/* Action Area */}
                    <div className="flex justify-center">
                        <Button
                            onClick={handleSelectFile}
                            disabled={loading}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-6 h-auto text-sm font-mono uppercase tracking-widest rounded-xl hover:scale-105 transition-all duration-300 shadow-lg shadow-orange-900/20"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Activity className="animate-spin" size={16} /> Analyzing...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <FileVideo size={16} /> Select Video File
                                </span>
                            )}
                        </Button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-center text-xs font-mono">
                            Error: {error}
                        </div>
                    )}

                    {/* Results */}
                    {result && (
                        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{result.filename}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-400 text-[10px] font-mono uppercase tracking-widest">
                                            {result.codec}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-400 text-[10px] font-mono uppercase tracking-widest">
                                            {result.fps} FPS
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-white tabular-nums">{result.resolution}</div>
                                    <div className="text-orange-400 text-xs font-mono tracking-widest uppercase">{result.quality_label}</div>
                                </div>
                            </div>

                            <div className="p-6 grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-xs uppercase tracking-widest font-mono">Bitrate</div>
                                    <div className="text-xl font-bold text-white flex items-baseline gap-1">
                                        {result.bitrate_kbps} <span className="text-xs text-zinc-600 font-normal">kbps</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-zinc-500 text-xs uppercase tracking-widest font-mono">Sharpness Score</div>
                                    <div className="text-xl font-bold text-white flex items-baseline gap-1">
                                        {result.sharpness_score} <span className="text-xs text-zinc-600 font-normal">/ 100</span>
                                    </div>
                                </div>
                            </div>

                            <div className={`p-4 flex items-start gap-3 ${result.is_true_native ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                {result.is_true_native ? (
                                    <CheckCircle size={20} className="shrink-0 mt-0.5" />
                                ) : (
                                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <h4 className="font-bold text-sm tracking-tight mb-1">
                                        {result.is_true_native ? 'Native Quality Verified' : 'Quality Warning'}
                                    </h4>
                                    <p className="text-xs opacity-90 leading-relaxed">
                                        {result.is_true_native
                                            ? "This video appears to be true native resolution with good sharpness levels."
                                            : result.warnings.join('. ') + "."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
