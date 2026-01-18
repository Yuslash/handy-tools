import { useState, useEffect } from 'react'
import { Video, Camera, ArrowRight, Zap, Clock, Disc, Globe } from 'lucide-react'
import { Widget } from '../components/Widget'
import { InteractiveGrid } from '../components/InteractiveGrid'
import { VideoDownloader } from './VideoDownloader'
import { ScrollingScreenshot } from './ScrollingScreenshot'
import { Titlebar } from '../components/Titlebar'

export function Home() {
    const [activeTool, setActiveTool] = useState<string | null>(null)
    const [time, setTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="h-full w-full relative overflow-hidden animate-in fade-in duration-1000 flex flex-col items-center justify-center p-8 selection:bg-[#ccff00] selection:text-black">

            {/* Background Grid - Ambient Void */}
            <InteractiveGrid />

            <Titlebar />

            {/* Main Hub Layout */}
            <div className={`w-full max-w-6xl z-10 transition-all duration-700 flex flex-col items-center justify-center h-full ${activeTool ? 'scale-95 opacity-0 blur-sm pointer-events-none' : 'scale-100 opacity-100 blur-0'}`}>

                {/* Header with Clock */}
                <div className="mb-16 text-center space-y-6">
                    <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-zinc-400 text-xs font-mono tracking-widest uppercase mb-4 shadow-2xl">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00] animate-pulse" />
                        SYSTEM ONLINE
                        <span className="text-zinc-600">|</span>
                        <Clock size={12} /> {formatTime(time)}
                    </div>
                    <div>
                        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-2 text-glow">
                            NEXUS
                        </h1>
                        <p className="text-lg text-zinc-500 font-light tracking-wide">Advanced Media Extraction Suite</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full px-8 max-w-4xl">
                    {/* Video Downloader Card */}
                    <div
                        onClick={() => setActiveTool('video')}
                        className="glass-panel group cursor-pointer relative overflow-hidden p-8 flex flex-col h-64 rounded-xl hover:border-[#ccff00]/50 transition-all duration-500"
                    >
                        <div className="absolute -right-8 -bottom-8 opacity-[0.03] group-hover:opacity-[0.1] transition-all duration-700 transform group-hover:scale-110 group-hover:rotate-12">
                            <Disc size={200} />
                        </div>

                        <div className="z-10 relative flex-1 flex flex-col">
                            <div className="mb-auto">
                                <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:bg-[#ccff00] transition-colors duration-300">
                                    <Video size={20} className="text-zinc-400 group-hover:text-black transition-colors" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-[#ccff00] transition-colors">Media Downloader</h2>
                                <p className="text-zinc-500 text-sm leading-relaxed max-w-[90%]">Extract high-fidelity video and audio streams from any supported platform.</p>
                            </div>

                            <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono uppercase tracking-widest group-hover:text-white transition-colors mt-4">
                                Initialize Module <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </div>

                    {/* Web Capture Card */}
                    <div
                        onClick={() => setActiveTool('screenshot')}
                        className="glass-panel group cursor-pointer relative overflow-hidden p-8 flex flex-col h-64 rounded-xl hover:border-cyan-400/50 transition-all duration-500"
                    >
                        <div className="absolute -right-8 -bottom-8 opacity-[0.03] group-hover:opacity-[0.1] transition-all duration-700 transform group-hover:scale-110 group-hover:-rotate-12">
                            <Globe size={200} />
                        </div>

                        <div className="z-10 relative flex-1 flex flex-col">
                            <div className="mb-auto">
                                <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:bg-cyan-400 transition-colors duration-300">
                                    <Camera size={20} className="text-zinc-400 group-hover:text-black transition-colors" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-cyan-400 transition-colors">Web Capture</h2>
                                <p className="text-zinc-500 text-sm leading-relaxed max-w-[90%]">Generate pixel-perfect scrolling screenshots of full webpages.</p>
                            </div>

                            <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono uppercase tracking-widest group-hover:text-white transition-colors mt-4">
                                Initialize Module <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="mt-16 flex items-center gap-6 text-[10px] text-zinc-600 font-mono tracking-widest uppercase">
                    <span>v2.0.0-alpha</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-800" />
                    <span>Local Environment</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-800" />
                    <span className="flex items-center gap-1.5"><Zap size={10} className="text-[#ccff00]" /> Systems Nominal</span>
                </div>

            </div>

            {/* Active Tool Overlay */}
            {activeTool && (
                <div className="absolute inset-0 z-40 flex items-center justify-center p-8 animate-in fade-in duration-300 bg-black/60 backdrop-blur-sm">
                    {/* Click outside to close */}
                    <div className="absolute inset-0 cursor-pointer" onClick={() => setActiveTool(null)} />

                    <div className="relative z-50 w-full flex justify-center">
                        {activeTool === 'video' && (
                            <Widget
                                title="Media Downloader"
                                onClose={() => setActiveTool(null)}
                                width="w-[800px]"
                            >
                                <VideoDownloader embedded />
                            </Widget>
                        )}

                        {activeTool === 'screenshot' && (
                            <Widget
                                title="Web Capture"
                                onClose={() => setActiveTool(null)}
                                width="w-[700px]"
                            >
                                <ScrollingScreenshot embedded />
                            </Widget>
                        )}
                    </div>
                </div>
            )}

        </div>
    )
}
