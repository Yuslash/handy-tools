import { useRef } from 'react'
import { X, Video, Camera } from 'lucide-react'

// Removed Draggable entirely to fix "offscreen" issues. 
// This Widget is now a static card intended to be centered by its parent.

interface WidgetProps {
    title: string
    children: React.ReactNode
    onClose?: () => void
    width?: string
}

export function Widget({ title, children, onClose, width = "w-full max-w-2xl" }: WidgetProps) {
    // nodeRef is no longer needed for Draggable, but kept if we need simple DOM access later.
    const nodeRef = useRef(null)

    return (
        <div ref={nodeRef} className={`relative z-10 ${width} pointer-events-auto`}>
            {/* ToyCad Style: Rounded-3xl (approx 2rem), Dark Matte, Subtle Shadow */}
            <div className="bg-[#111113] rounded-[2rem] overflow-hidden flex flex-col shadow-[0_40px_80px_rgba(0,0,0,0.6)] border border-[#1f1f22]">

                {/* Header */}
                <div className="h-16 flex items-center justify-between px-8 bg-[#18181b] border-b border-[#1f1f22]">
                    <div className="flex items-center gap-3 text-lg font-bold text-zinc-300">
                        {/* Dynamic Icon based on title hint */}
                        {title.toLowerCase().includes("video") && <Video size={20} className="text-[#bef264]" />}
                        {title.toLowerCase().includes("capture") && <Camera size={20} className="text-cyan-400" />}
                        <span className="tracking-wide">{title}</span>
                    </div>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-[#27272a] flex items-center justify-center text-zinc-400 hover:bg-[#ef4444] hover:text-white transition-all duration-300"
                            title="Close"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <div className="p-0 bg-[#111113]">
                    {children}
                </div>
            </div>
        </div>
    )
}
