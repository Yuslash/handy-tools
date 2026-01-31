import sys
import os
import io
import subprocess
import json
import asyncio
import threading
import queue
from pathlib import Path

from fastapi import FastAPI, WebSocket, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Adjust path to allow imports if run directly
# Assuming we are running from python_backend root or python_backend/app/api
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

try:
    from app.core import downloader as backend
    from app.core.utils import check_ffmpeg, parse_time_to_seconds
    from app.schemas import UrlRequest, DownloadRequest
except ImportError:
    # If we are running relative to python_backend
    try:
        from python_backend.app.core import downloader as backend
        from python_backend.app.core.utils import check_ffmpeg, parse_time_to_seconds
        from python_backend.app.schemas import UrlRequest, DownloadRequest
    except ImportError:
        # Fallback if things are messy
        print("Error importing app modules. Ensure you are running from the correct directory.")
        backend = None
        check_ffmpeg = lambda: False
        parse_time_to_seconds = lambda x: None
        UrlRequest = None
        DownloadRequest = None
        # This will likely crash later if not fixed, but let's proceed to define the app

# Force UTF-8 encoding for stdout/stderr to handle emojis/unicode on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

app = FastAPI()

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from app.api.video_quality import router as quality_router
    app.include_router(quality_router, prefix="/api")
except ImportError as e:
    print(f"Error importing quality router: {e}")
    # Fallback for relative run
    try:
        from python_backend.app.api.video_quality import router as quality_router
        app.include_router(quality_router, prefix="/api")
    except ImportError:
        pass

try:
    from app.api.gif_converter import router as gif_router
    app.include_router(gif_router, prefix="/api")
except ImportError as e:
    print(f"Error importing gif router: {e}")
    # Fallback for relative run
    try:
        from python_backend.app.api.gif_converter import router as gif_router
        app.include_router(gif_router, prefix="/api")
    except ImportError:
        pass

# Check FFmpeg at startup
FFMPEG_AVAILABLE = check_ffmpeg()
print(f"[Startup] FFmpeg available: {FFMPEG_AVAILABLE}")

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
                output_dir = message.get("output_dir", None)
                start_time = message.get("start_time", None)
                end_time = message.get("end_time", None)
                await run_download_with_events(url, format_id, audio_only, websocket, output_dir, start_time, end_time)
                
    except Exception as e:
        print(f"[WS] Error: {e}")

async def run_download_with_events(url, format_id, audio_only, websocket, output_dir=None, start_time=None, end_time=None):
    import yt_dlp
    
    progress_queue = queue.Queue()
    
    def progress_hook(d):
        # Debug: Print all keys and status to see what's happening
        status = d.get('status', 'unknown')
        # print(f"[Debug Hook] Status: {status} | Keys: {list(d.keys())}")
        
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
    
    # Clip Logic: Detect and optimize for 4K
    download_ranges = None
    if "/clip/" in url:
        await websocket.send_json({"type": "info", "message": "Analyzing Clip metadata..."})
        try:
            def get_clip_info():
                with yt_dlp.YoutubeDL({'quiet': True, 'ignoreerrors': True}) as ydl_temp:
                    return ydl_temp.extract_info(url, download=False)
            
            clip_info = await asyncio.to_thread(get_clip_info)
            
            if clip_info:
                # Extract timestamps and video ID
                s_start = clip_info.get('start_time') or clip_info.get('section_start')
                s_end = clip_info.get('end_time') or clip_info.get('section_end')
                
                v_id = clip_info.get('video_id')
                if not v_id:
                     # Parse from original_url if available
                     orig_url = clip_info.get('original_url')
                     if orig_url and 'v=' in orig_url:
                         v_id = orig_url.split('v=')[1].split('&')[0]
                     elif clip_info.get('webpage_url_domain') == 'youtube.com':
                         pass
                
                # If we have valid ranges, switch to main video for better quality
                if s_start is not None and s_end is not None and v_id:
                    print(f"[Clip] Found range: {s_start}-{s_end} for Video ID: {v_id}")
                    # Switch to main video URL
                    url = f"https://www.youtube.com/watch?v={v_id}"
                    download_ranges = [(s_start, s_end)]
                    await websocket.send_json({"type": "info", "message": f"Detected 4K Clip. Downloading range {s_start}-{s_end}s from main video"})
        except Exception as e:
            print(f"[Clip] Extraction failed: {e}")
            
    # Interactive Range Logic (overrides clip logic if provided)
    if start_time and end_time:
        s_sec = parse_time_to_seconds(start_time)
        e_sec = parse_time_to_seconds(end_time)
        
        if s_sec is not None and e_sec is not None:
             if e_sec > s_sec:
                 download_ranges = [(s_sec, e_sec)]
                 print(f"[Range] Custom range: {s_sec}-{e_sec}s")
                 await websocket.send_json({"type": "info", "message": f"Downloading Custom Range: {s_sec}s - {e_sec}s"})
             else:
                 await websocket.send_json({"type": "error", "message": "Start time must be less than end time"})
                 return

    if not output_dir:
        output_dir = os.path.join(Path.home(), "Downloads")
        
    os.makedirs(output_dir, exist_ok=True)
    
    # Use timestamp in filename
    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s_%(epoch)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': True,
        'noprogress': False,
    }
    
    # Apply download ranges if this is a clip
    if download_ranges:
        ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, download_ranges)
        # Force 4K selection for clips if not audio-only
        if not audio_only and FFMPEG_AVAILABLE:
            # Match user's working script configuration exactly
            ydl_opts['format'] = 'bestvideo[height>=2160]+bestaudio/bestvideo+bestaudio/best'
            ydl_opts['force_keyframes_at_cuts'] = False
            # Remove explicit merge format to let yt-dlp choose optimal container
            # Enforce MP4 merge specifically for clips to ensure audio is widely compatible
            ydl_opts['merge_output_format'] = 'mp4'
            print("[Clip] Using proven working configuration (MP4 merge, no forced keyframes)")
    
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
            # If we set a specific format for ranges/clips, don't overwrite it unless necessary
            if not download_ranges:
                if format_id and format_id != 'bestvideo+bestaudio/best':
                    ydl_opts['format'] = f'{format_id}+bestaudio[acodec^=mp4a]/{format_id}+bestaudio/bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best'
                else:
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
                    p_str = msg.get("percent", "0").replace('%', '').strip()
                    p_val = float(p_str)
                    
                    if p_val >= last_percent_val or (last_percent_val > 90 and p_val < 10):
                        last_percent_val = p_val
                        await websocket.send_json(msg)
                    else:
                        pass # Skip regressive progress
                except ValueError:
                    await websocket.send_json(msg)
            else:
                await websocket.send_json(msg)
            
            if msg.get("type") in ["complete", "error"]:
                break
        except queue.Empty:
            await asyncio.sleep(0.05)
    
    download_thread.join(timeout=2)
    print("[WS] Download function complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
