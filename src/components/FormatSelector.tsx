import { Video, Music, Check } from "lucide-react"

interface FormatSelectorProps {
    onSelect: (id: string, audioOnly: boolean) => void
    selectedId: string | null
}

export function FormatSelector({ onSelect, selectedId }: FormatSelectorProps) {
    const isVideo = selectedId === 'bestvideo+bestaudio/best'
    const isAudio = selectedId === 'bestaudio/best'

    return (
        <div className="grid grid-cols-2 gap-3">
            {/* Video Option */}
            <button
                onClick={() => onSelect('bestvideo+bestaudio/best', false)}
                className={`
                    relative group flex flex-col items-start p-3 rounded-lg border transition-all duration-300 text-left cursor-pointer
                    ${isVideo
                        ? 'bg-[#ccff00]/10 border-[#ccff00] shadow-[0_0_15px_-5px_#ccff00]'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                    }
                `}
            >
                <div className="flex items-center justify-between w-full mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isVideo ? 'text-[#ccff00]' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                        MP4 Container
                    </span>
                    {isVideo && <Check size={12} className="text-[#ccff00]" />}
                </div>

                <div className="flex items-center gap-2 mb-1">
                    <Video size={16} className={isVideo ? 'text-white' : 'text-zinc-400'} />
                    <span className={`font-bold text-sm ${isVideo ? 'text-white' : 'text-zinc-400'}`}>Best Video</span>
                </div>

                <div className="text-[10px] font-mono text-zinc-500 mt-1">
                    2160p / 1440p / 1080p
                </div>
            </button>

            {/* Audio Option */}
            <button
                onClick={() => onSelect('bestaudio/best', true)}
                className={`
                    relative group flex flex-col items-start p-3 rounded-lg border transition-all duration-300 text-left cursor-pointer
                    ${isAudio
                        ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_-5px_cyan]'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                    }
                `}
            >
                <div className="flex items-center justify-between w-full mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isAudio ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                        MP3 Extraction
                    </span>
                    {isAudio && <Check size={12} className="text-cyan-400" />}
                </div>

                <div className="flex items-center gap-2 mb-1">
                    <Music size={16} className={isAudio ? 'text-white' : 'text-zinc-400'} />
                    <span className={`font-bold text-sm ${isAudio ? 'text-white' : 'text-zinc-400'}`}>Audio Only</span>
                </div>

                <div className="text-[10px] font-mono text-zinc-500 mt-1">
                    320kbps / Variable CBR
                </div>
            </button>
        </div>
    )
}
