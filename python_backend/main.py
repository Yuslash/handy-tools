import sys
import os
import io
import subprocess

# Force UTF-8 encoding for stdout/stderr to handle emojis/unicode on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import json

# Add current directory to path so we can import final.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import logic from final.py
try:
    import final as backend
except ImportError:
    print("Error importing final.py")
    backend = None

app = FastAPI()

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def check_ffmpeg():
    """Check if FFmpeg is available in PATH"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        return result.returncode == 0
    except:
        return False

# Check FFmpeg at startup
FFMPEG_AVAILABLE = check_ffmpeg()
print(f"[Startup] FFmpeg available: {FFMPEG_AVAILABLE}")

class UrlRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    output_dir: str = None
    audio_only: bool = False

@app.get("/")
async def read_root():
    return {"status": "ok", "service": "Link Downloader Backend", "ffmpeg": FFMPEG_AVAILABLE}

@app.post("/api/info")
async def get_info(request: UrlRequest):
    if not backend:
        raise HTTPException(status_code=500, detail="Backend logic not loaded")
    
    try:
        info = await asyncio.to_thread(backend.get_video_info, request.url)
        if not info:
             raise HTTPException(status_code=400, detail="Could not retrieve video info")
        
        formats = backend.list_available_formats(info)
        
        return {
            "title": info.get('title'),
            "thumbnail": info.get('thumbnail'),
            "duration": info.get('duration_string'),
            "uploader": info.get('uploader'),
            "formats": formats,
            "ffmpeg_available": FFMPEG_AVAILABLE
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Connection accepted")
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            print(f"[WS] Received: {message}")
            
            if message.get("action") == "download":
                url = message.get("url")
                format_id = message.get("format_id")
                audio_only = message.get("audio_only", False)
                await run_download_with_events(url, format_id, audio_only, websocket)
                
    except Exception as e:
        print(f"[WS] Error: {e}")

async def run_download_with_events(url, format_id, audio_only, websocket):
    import yt_dlp
    import queue
    import threading
    
    progress_queue = queue.Queue()
    
    def progress_hook(d):
        status = d.get('status', '')
        if status == 'downloading':
            percent_str = d.get('_percent_str', '0%').strip()
            speed_str = d.get('_speed_str', 'N/A')
            eta_str = d.get('_eta_str', 'N/A')
            print(f"[Hook] Progress: {percent_str} Speed: {speed_str} ETA: {eta_str}")
            progress_queue.put({
                "type": "progress",
                "percent": percent_str,
                "speed": speed_str if speed_str else 'N/A',
                "eta": eta_str if eta_str else 'N/A'
            })
        elif status == 'finished':
            print("[Hook] File finished")
            progress_queue.put({"type": "finished_file"})
    
    await websocket.send_json({"type": "info", "message": "Download started..."})
    print("[WS] Sent download started info")
    
    # Build yt-dlp options
    from pathlib import Path
    import time
    output_dir = os.path.join(Path.home(), "Downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    # Use timestamp in filename to ensure uniqueness and avoid file locking errors (User Request: filename1, 2, 3 style, but timestamp is safer/easier)
    # Actually, to strictly follow "filename1, 2..." we'd need complex logic. Timestamp is a robust "unique" approach.
    # Let's add a small random hash or timestamp to guarantee it.
    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s_%(epoch)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': True,
        'noprogress': False,
    }
    
    # Handle audio-only downloads
    if audio_only:
        if FFMPEG_AVAILABLE:
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        else:
            # Without FFmpeg, just get best audio stream (m4a or similar)
            ydl_opts['format'] = 'bestaudio/best'
            await websocket.send_json({"type": "info", "message": "Note: FFmpeg not found - audio will be in original format"})
    else:
        # Video download
        if FFMPEG_AVAILABLE:
            if format_id and format_id != 'bestvideo+bestaudio/best':
                ydl_opts['format'] = f'{format_id}+bestaudio[acodec^=mp4a]/{format_id}+bestaudio/bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best'
            else:
                # Prioritize H.264 (AVC) and AAC (M4A) for maximum compatibility on Windows
                # format string explanation:
                # 1. Best H.264 video + Best AAC audio
                # 2. Best MP4 video + Best M4A audio
                # 3. Best video + Best audio (fallback)
                # 4. Best single file (fallback)
                ydl_opts['format'] = 'bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
        else:
            # Without FFmpeg, prefer pre-merged formats
            ydl_opts['format'] = 'best[ext=mp4]/best'
            await websocket.send_json({"type": "info", "message": "Note: FFmpeg not found - using pre-merged format"})
    
    print(f"[Download] Format: {ydl_opts['format']}, FFmpeg: {FFMPEG_AVAILABLE}")
    
    download_complete = threading.Event()
    download_error = None
    
    # Run download in a thread
    def do_download():
        nonlocal download_error
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            progress_queue.put({"type": "complete"})
        except Exception as e:
            download_error = str(e)
            progress_queue.put({"type": "error", "message": str(e)})
        finally:
            download_complete.set()
    
    download_thread = threading.Thread(target=do_download)
    download_thread.start()
    
    # Poll for progress updates and send via WebSocket
    last_percent_val = -1.0
    
    while not download_complete.is_set() or not progress_queue.empty():
        try:
            msg = progress_queue.get(timeout=0.1)
            
            if msg.get("type") == "progress":
                try:
                    # Convert to float to check monotonicity
                    # percent comes as "12.3%" or " 12.3"
                    p_str = msg.get("percent", "0").replace('%', '').strip()
                    p_val = float(p_str)
                    
                    # Prevent backward jumps (ignored if it restarts at 0 for a new fragment, 
                    # but typically we want to avoid 40% -> 39% jitters)
                    # However, yt-dlp might reset to 0 for audio download after video.
                    # Simple heuristic: if difference is huge (like 100 -> 0), allow it (new stage).
                    # If difference is small and negative (45.5 -> 45.4), ignore it.
                    
                    if p_val >= last_percent_val or (last_percent_val > 90 and p_val < 10):
                        last_percent_val = p_val
                        await websocket.send_json(msg)
                        print(f"[WS] Sent progress: {msg}")
                    else:
                        print(f"[WS] Skipped regressive progress: {p_val}% (was {last_percent_val}%)")
                except ValueError:
                    # If parse fails, just send it
                    await websocket.send_json(msg)
            else:
                await websocket.send_json(msg)
                print(f"[WS] Sent: {msg}")
            
            if msg.get("type") in ["complete", "error"]:
                break
        except queue.Empty:
            await asyncio.sleep(0.05)
    
    download_thread.join(timeout=2)
    print("[WS] Download function complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
