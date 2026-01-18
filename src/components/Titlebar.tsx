import { FolderOpen } from "lucide-react"
import { Button } from "./ui/Button"

export function Titlebar() {
    const handleMinimize = () => {
        window.ipcRenderer.send('minimize')
    }

    const handleClose = () => {
        window.ipcRenderer.send('close')
    }

    const handleOpenDownloads = () => {
        window.ipcRenderer.send('open-downloads')
    }

    return (
        <div className="h-10 w-full flex items-center justify-between px-4 fixed top-0 left-0 bg-transparent draggable select-none z-[100]">
            <div className="text-xs font-medium tracking-widest uppercase text-white/30 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/5">
                Link Downloader
            </div>
            <div className="flex items-center gap-1 no-drag">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
                    onClick={handleOpenDownloads}
                    title="Open Downloads Folder"
                >
                    <FolderOpen size={14} />
                </Button>
                <div className="w-[1px] h-3 bg-white/10 mx-1" />
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-white/10" onClick={handleMinimize}>
                    <div className="w-2.5 h-[1px] bg-white opacity-50" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-red-500/20 group" onClick={handleClose}>
                    <div className="relative w-3 h-3">
                        <div className="absolute top-1/2 left-0 w-3 h-[1px] bg-white opacity-50 -rotate-45 group-hover:bg-red-500" />
                        <div className="absolute top-1/2 left-0 w-3 h-[1px] bg-white opacity-50 rotate-45 group-hover:bg-red-500" />
                    </div>
                </Button>
            </div>
        </div>
    )
}
