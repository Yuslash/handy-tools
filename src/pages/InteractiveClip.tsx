import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ScanLine, Clock, PlayCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DownloadCard } from '../components/DownloadCard'

export function InteractiveClip({ embedded = false }: { embedded?: boolean }) {
    const [url, setUrl] = useState('')
    const [startTime, setStartTime] = useState('')
    const [endTime, setEndTime] = useState('')
    const [loading, setLoading] = useState(false)
    const [downloadState, setDownloadState] = useState<any>({ status: 'idle', percent: 0, speed: '', eta: '' })
    const [logMessage, setLogMessage] = useState<string>('')

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

                if (data.type === 'info') {
                    setLogMessage(data.message)
                } else if (data.type === 'progress') {
                    const pct = parseFloat(data.percent.replace('%', '')) || 0
                    setDownloadState({
                        status: 'downloading',
                        percent: pct,
                        speed: data.speed,
                        eta: data.eta
                    })
                } else if (data.type === 'complete' || data.type === 'finished_file') {
                    setDownloadState((prev: any) => ({ ...prev, status: 'completed', percent: 100 }))
                    setLogMessage('Download Completed')
                } else if (data.type === 'error') {
                    setDownloadState((prev: any) => ({ ...prev, status: 'error', error: data.message }))
                    setLogMessage(`Error: ${data.message}`)
                    setLoading(false)
                }
            } catch (e) {
                console.error("WS Error", e)
            }
        }

        return () => {
            ws.current?.close()
        }
    }, [])

    const handleDownload = () => {
        if (!url || !ws.current) return
        if (!startTime || !endTime) {
            setLogMessage("Please specify both Start and End times.")
            return
        }

        setLoading(true)
        setDownloadState({ status: 'downloading', percent: 0, speed: 'Initializing...', eta: '...' })
        setLogMessage('Initializing Precision Download...')

        ws.current.send(JSON.stringify({
            action: 'download',
            url: url,
            format_id: 'bestvideo+bestaudio',
            audio_only: false,
            start_time: startTime,
            end_time: endTime
        }))
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 text-white font-sans">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Precision Clip Extraction</span>
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

                <div className="w-full max-w-3xl flex flex-col gap-8">

                    {/* Intro */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 mb-4">
                            <ScanLine size={24} />
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Precision Clip 4K</h2>
                        <p className="text-zinc-500 text-sm max-w-md mx-auto">
                            Extract custom segments from any long video in original quality.
                        </p>
                    </div>

                    {/* Inputs */}
                    <div className="flex flex-col gap-4">

                        {/* URL Input */}
                        <div className="glass-panel p-2 rounded-xl flex items-center gap-2 overflow-hidden transition-all duration-300 focus-within:ring-1 focus-within:ring-indigo-500/50">
                            <div className="pl-3 text-zinc-500">
                                <PlayCircle size={18} strokeWidth={2.5} />
                            </div>
                            <input
                                placeholder="https://youtube.com/watch?v=..."
                                className="flex-1 bg-transparent border-0 h-10 px-2 text-sm text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-mono"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                        </div>

                        {/* Time Inputs */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="glass-panel p-2 rounded-xl flex items-center gap-2 overflow-hidden transition-all duration-300 focus-within:ring-1 focus-within:ring-indigo-500/50">
                                <div className="pl-3 text-zinc-500">
                                    <Clock size={16} />
                                </div>
                                <input
                                    placeholder="Start (16:00)"
                                    className="flex-1 bg-transparent border-0 h-10 px-2 text-sm text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-mono"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                />
                            </div>
                            <div className="glass-panel p-2 rounded-xl flex items-center gap-2 overflow-hidden transition-all duration-300 focus-within:ring-1 focus-within:ring-indigo-500/50">
                                <div className="pl-3 text-zinc-500">
                                    <Clock size={16} />
                                </div>
                                <input
                                    placeholder="End (18:50)"
                                    className="flex-1 bg-transparent border-0 h-10 px-2 text-sm text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-mono"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <Button
                            size="lg"
                            onClick={handleDownload}
                            disabled={loading && downloadState.status !== 'completed' && downloadState.status !== 'error'}
                            className="h-12 w-full rounded-xl text-xs font-bold font-mono uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white border-0 shadow-lg shadow-indigo-900/20"
                        >
                            Start Extraction
                        </Button>
                    </div>

                    {/* Status Log */}
                    {logMessage && (
                        <div className="text-center">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 animate-pulse">
                                {logMessage}
                            </p>
                        </div>
                    )}

                    {/* Download Progress */}
                    {(downloadState.status !== 'idle' || loading) && (
                        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 mt-4">
                            <DownloadCard state={downloadState} title="Segment Extraction" />
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
