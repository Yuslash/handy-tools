import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Lock, MoreHorizontal, Globe } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function ScrollingScreenshot({ embedded = false }: { embedded?: boolean }) {
    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 text-white font-sans">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_cyan]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Capture Node</span>
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
                <div className="w-full max-w-4xl flex flex-col gap-8">

                    {/* Search Bar Area */}
                    <div className="glass-panel p-2 rounded-xl flex items-center gap-2 overflow-hidden transition-all duration-300 focus-within:ring-1 focus-within:ring-cyan-400/50">
                        <div className="pl-3 text-zinc-500">
                            <Globe size={18} strokeWidth={2.5} />
                        </div>
                        <input
                            placeholder="Entet target URL for full-page capture..."
                            className="flex-1 bg-transparent border-0 h-10 px-2 text-sm text-white placeholder:text-zinc-600 focus:ring-0 outline-none font-mono"
                        />
                        <Button
                            size="sm"
                            className="h-10 px-6 rounded-lg text-xs font-bold font-mono uppercase tracking-widest bg-cyan-400 text-black hover:bg-cyan-300 border-0 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                        >
                            Start Capture
                        </Button>
                    </div>

                    {/* Browser Mockup */}
                    <div className="w-full glass-panel rounded-lg overflow-hidden flex flex-col min-h-[500px] border border-white/10 shadow-2xl animate-in slide-in-from-bottom-6 duration-700">

                        {/* Browser Toolbar */}
                        <div className="h-9 bg-[#0a0a0a] border-b border-white/5 flex items-center px-4 gap-4">
                            <div className="flex gap-1.5 opacity-50">
                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                            </div>

                            {/* Address Bar Mock */}
                            <div className="flex-1 max-w-lg mx-auto h-6 bg-[#1a1a1a] rounded flex items-center px-3 gap-2 text-[10px] text-zinc-500 font-mono">
                                <Lock size={8} />
                                <span className="opacity-50">waiting-for-target-connection...</span>
                            </div>

                            <div className="text-zinc-700">
                                <MoreHorizontal size={14} />
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 bg-[#050505] relative flex flex-col items-center justify-center p-8">
                            {/* Placeholder Graphic */}
                            <div className="text-center space-y-4 opacity-30">
                                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/5 border border-white/10 mb-4">
                                    <Camera size={40} className="text-zinc-400" />
                                </div>
                                <h3 className="text-lg font-bold text-zinc-400 font-mono tracking-widest uppercase">Viewport Idle</h3>
                                <p className="text-xs text-zinc-600 font-mono max-w-sm mx-auto">
                                    System ready to initiate headless browser sequence.
                                    Input URL above to begin render.
                                </p>
                            </div>

                            {/* Grid Overlay */}
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
                        </div>

                    </div>

                </div>
            </div>
        </div>
    )
}
