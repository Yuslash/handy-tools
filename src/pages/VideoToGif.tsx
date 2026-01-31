import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileVideo, Image as ImageIcon, Video, FolderOpen, Play } from 'lucide-react'
import { Button } from '../components/ui/Button'

interface GifResponse {
    status: string
    output_path: string
}

export function VideoToGif({ embedded = false }: { embedded?: boolean }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [resultPath, setResultPath] = useState<string | null>(null)
    const [filePath, setFilePath] = useState<string | null>(null)

    // Form State
    const [startTime, setStartTime] = useState("")
    const [endTime, setEndTime] = useState("")
    const [fps, setFps] = useState(15)
    const [width, setWidth] = useState(480)

    const handleSelectFile = async () => {
        try {
            setError(null)
            const path = await window.ipcRenderer.invoke('select-file')
            if (path) {
                setFilePath(path)
                setResultPath(null)
            }
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleConvert = async () => {
        if (!filePath) return

        try {
            setLoading(true)
            setError(null)
            setResultPath(null)

            const response = await fetch('http://localhost:8000/api/convert_gif', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: filePath,
                    start_time: startTime || null,
                    end_time: endTime || null,
                    fps: fps,
                    width: width
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || 'Conversion failed')
            }

            const data: GifResponse = await response.json()
            setResultPath(data.output_path)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const openFolder = async () => {
        if (resultPath) {
            await window.ipcRenderer.invoke('open-file-location', resultPath)
        }
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 text-white font-sans">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Gif Converter</span>
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
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 mb-4">
                            <ImageIcon size={24} />
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Video to GIF</h2>
                        <p className="text-zinc-500 text-sm max-w-md mx-auto">
                            Convert video clips into high-quality GIFs.
                        </p>
                    </div>

                    {/* File Selection */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-zinc-300 truncate max-w-[300px]">
                                {filePath ? filePath : "No file selected"}
                            </div>
                            <Button
                                onClick={handleSelectFile}
                                className="bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-2 h-auto"
                            >
                                Select Video
                            </Button>
                        </div>

                        {filePath && (
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest text-zinc-500">Start Time (e.g. 00:05)</label>
                                    <input
                                        type="text"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        placeholder="00:00"
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest text-zinc-500">End Time (e.g. 00:10)</label>
                                    <input
                                        type="text"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        placeholder="00:05"
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest text-zinc-500">FPS</label>
                                    <input
                                        type="number"
                                        value={fps}
                                        onChange={(e) => setFps(parseInt(e.target.value))}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest text-zinc-500">Width (px)</label>
                                    <input
                                        type="number"
                                        value={width}
                                        onChange={(e) => setWidth(parseInt(e.target.value))}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Area */}
                    <div className="flex justify-center">
                        <Button
                            onClick={handleConvert}
                            disabled={loading || !filePath}
                            className={`
                                text-white px-8 py-6 h-auto text-sm font-mono uppercase tracking-widest rounded-xl hover:scale-105 transition-all duration-300 shadow-lg
                                ${loading || !filePath ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'}
                            `}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Video className="animate-spin" size={16} /> Converting...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Play size={16} fill="currentColor" /> Convert to GIF
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
                    {resultPath && (
                        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500 bg-white/5 border border-white/10 rounded-xl overflow-hidden p-6 text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-2">
                                <ImageIcon size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white">Conversion Complete!</h3>
                            <p className="text-zinc-500 text-sm break-all">{resultPath}</p>

                            <Button
                                onClick={openFolder}
                                className="bg-white/10 hover:bg-white/20 text-white mt-2"
                            >
                                <FolderOpen size={16} className="mr-2" /> Open Folder
                            </Button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
