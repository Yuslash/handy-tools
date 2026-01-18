import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { FormatSelector } from '../components/FormatSelector'
import { DownloadCard } from '../components/DownloadCard'

export function VideoDownloader({ embedded = false }: { embedded?: boolean }) {
    const [url, setUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [videoInfo, setVideoInfo] = useState<any>(null)
    const [selectedFormat, setSelectedFormat] = useState<string | null>(null)
    const [isAudioDownload, setIsAudioDownload] = useState(false)
    const [downloadState, setDownloadState] = useState<any>({ status: 'idle', percent: 0, speed: '', eta: '' })

    const ws = useRef<WebSocket | null>(null)

    useEffect(() => {
        // Connect to WebSocket
        ws.current = new WebSocket('ws://localhost:8000/api/ws')

        ws.current.onopen = () => {
            console.log('Connected to WebSocket')
        }

        ws.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.type === 'progress') {
                    const pct = parseFloat(data.percent.replace('%', '')) || 0
                    setDownloadState({
                        status: 'downloading',
                        percent: pct,
                        speed: data.speed,
                        eta: data.eta
                    })
                } else if (data.type === 'complete') {
                    setDownloadState((prev: any) => ({ ...prev, status: 'completed', percent: 100 }))
                } else if (data.type === 'error') {
                    setDownloadState((prev: any) => ({ ...prev, status: 'error', error: data.message }))
                }
            } catch (e) {
                console.error("WS Error", e)
            }
        }

        return () => {
            ws.current?.close()
        }
    }, [])

    const handleAnalyze = async () => {
        if (!url) return
        setLoading(true)
        setVideoInfo(null)
        setSelectedFormat(null)
        setIsAudioDownload(false)
        setDownloadState({ status: 'idle', percent: 0 })

        try {
            const res = await fetch('http://localhost:8000/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            })
            const data = await res.json()
            if (res.ok) {
                setVideoInfo(data)
            } else {
                console.error(data.detail)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleFormatSelect = (formatId: string, audioOnly: boolean) => {
        setSelectedFormat(formatId)
        setIsAudioDownload(audioOnly)
    }

    const handleDownload = () => {
        if (!url || !ws.current) return

        // reset state
        setDownloadState({ status: 'downloading', percent: 0, speed: 'Starting...', eta: '...' })

        ws.current.send(JSON.stringify({
            action: 'download',
            url: url,
            format_id: selectedFormat,
            audio_only: isAudioDownload
        }))
    }

    return (

        <div className="flex flex-col h-full animate-in fade-in duration-500 text-white font-sans">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ccff00] shadow-[0_0_10px_#ccff00]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Input Terminal</span>
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

                <div className="w-full max-w-4xl flex flex-col gap-6">

                    {/* Search Bar Area */}
                    <div className="glass-panel p-2 rounded-xl flex items-center gap-2 overflow-hidden transition-all duration-300 focus-within:ring-1 focus-within:ring-[#ccff00]/50">
                        <div className="pl-3 text-zinc-500">
                            <Search size={18} strokeWidth={2.5} />
                        </div>
                        <input
                            placeholder="Paste exact URL resource..."
                            className="flex-1 bg-transparent border-0 h-10 px-2 text-sm text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-mono"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                        />
                        <Button
                            size="sm"
                            onClick={handleAnalyze}
                            disabled={loading}
                            variant="neon"
                            className="h-10 px-6 rounded-lg text-xs font-bold font-mono uppercase tracking-widest"
                        >
                            {loading ? "SCANNING" : "ANALYZE"}
                        </Button>
                    </div>

                    {/* Results Area */}
                    {videoInfo && (
                        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 glass-panel rounded-xl p-6">

                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Media Thumbnail */}
                                <div className="w-full md:w-[320px] shrink-0">
                                    <div className="rounded-lg overflow-hidden aspect-video bg-black/50 relative border border-white/10 group">
                                        <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-700 grayscale hover:grayscale-0" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono text-[#ccff00] border border-[#ccff00]/20">
                                            {videoInfo.duration}
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <h3 className="font-bold text-sm leading-tight text-white line-clamp-2">{videoInfo.title}</h3>
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">{videoInfo.uploader}</p>
                                    </div>
                                </div>

                                {/* Configuration */}
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">Target Format</span>
                                            <span className="text-[10px] font-mono text-[#ccff00]">AUTO-DETECTED</span>
                                        </div>

                                        <FormatSelector
                                            selectedId={selectedFormat}
                                            onSelect={handleFormatSelect}
                                        />
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-white/5">
                                        <Button
                                            size="lg"
                                            disabled={!selectedFormat || downloadState.status === 'downloading'}
                                            onClick={handleDownload}
                                            variant="neon"
                                            className="w-full h-12 text-xs font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-3"
                                        >
                                            {downloadState.status === 'downloading' ? (
                                                <span className="animate-pulse">PROCESSING STREAM...</span>
                                            ) : (
                                                <>
                                                    <span>{isAudioDownload ? "EXTRACT AUDIO TRACK" : "INITIATE DOWNLOAD"}</span>
                                                    <ChevronRight size={14} />
                                                </>
                                            )}
                                        </Button>

                                        <div className="mt-4">
                                            <DownloadCard state={downloadState} title={videoInfo.title} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
