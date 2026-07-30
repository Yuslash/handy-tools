import sys
import os
import io
import re
import subprocess
import json
import asyncio
import threading
import queue
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
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
    from app.schemas import UrlRequest
except ImportError:
    # Running relative to the repo root rather than python_backend/
    from python_backend.app.core import downloader as backend
    from python_backend.app.core.utils import check_ffmpeg, parse_time_to_seconds
    from python_backend.app.schemas import UrlRequest

# Force UTF-8 encoding for stdout/stderr to handle emojis/unicode on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

app = FastAPI(title="Bench backend")

# The renderer is the only client. Wildcard origin with allow_credentials is
# invalid per the CORS spec and rejected by browsers, so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from app.api.video_quality import router as quality_router
except ImportError:
    from python_backend.app.api.video_quality import router as quality_router
app.include_router(quality_router, prefix="/api")

try:
    from app.api.gif_converter import router as gif_router
except ImportError:
    from python_backend.app.api.gif_converter import router as gif_router
app.include_router(gif_router, prefix="/api")

# Check FFmpeg at startup
FFMPEG_AVAILABLE = check_ffmpeg()
print(f"[Startup] FFmpeg available: {FFMPEG_AVAILABLE}", flush=True)

def tidy_error(e):
    """Strip yt-dlp's ANSI codes and 'ERROR:' prefix so the UI can show the message as-is."""
    msg = re.sub(r'\x1b\[[0-9;]*m', '', str(e)).strip()
    return re.sub(r'^ERROR:\s*', '', msg) or "Something went wrong."


@app.get("/")
async def read_root():
    return {"status": "ok", "service": "Bench backend", "ffmpeg": FFMPEG_AVAILABLE}


@app.post("/api/info")
async def get_info(request: UrlRequest):
    try:
        info = await asyncio.to_thread(backend.get_video_info, request.url)
    except Exception as e:
        # yt-dlp's own message is the useful one ("Video unavailable",
        # "Private video", "Unsupported URL") — pass it through.
        raise HTTPException(status_code=400, detail=tidy_error(e))

    if not info:
        raise HTTPException(status_code=400, detail="No video found at that URL.")

    return {
        "title": info.get('title'),
        "thumbnail": info.get('thumbnail'),
        "duration": info.get('duration_string'),
        "uploader": info.get('uploader'),
        "formats": backend.list_available_formats(info),
        "ffmpeg_available": FFMPEG_AVAILABLE,
    }

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Connection accepted")
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            print(f"[WS] Received: {message}")

            if message.get("action") != "download":
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown action: {message.get('action')!r}",
                })
                continue

            if not message.get("url"):
                await websocket.send_json({"type": "error", "message": "No URL provided."})
                continue

            try:
                await run_download_with_events(
                    message["url"],
                    message.get("format_id"),
                    message.get("audio_only", False),
                    websocket,
                    message.get("output_dir"),
                    message.get("start_time"),
                    message.get("end_time"),
                )
            except Exception as e:
                # Never leave the UI stuck on a stale percentage — always report.
                print(f"[WS] Download failed: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Connection error: {e}")

class ProgressLogger:
    def __init__(self, progress_queue, total_duration=None):
        self.progress_queue = progress_queue
        self.total_duration = total_duration
        self.last_percent = -1

    def debug(self, msg):
        self._parse_progress(msg)

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        self._parse_progress(msg)

    def _parse_progress(self, msg):
        if not self.total_duration or "time=" not in msg:
            return

        # Regex to find time=HH:MM:SS.mm or similar
        import re
        match = re.search(r'time=\s*(\d+:\d+:\d+\.\d+|\d+\.\d+)', msg)
        if match:
            time_str = match.group(1)
            try:
                # Use the existing parse_time_to_seconds or simple logic considering we are in server.py
                # We can import parse_time_to_seconds from utils if not available, 
                # but it was imported at top of file.
                current_time = parse_time_to_seconds(time_str)
                if current_time is not None:
                    # Calculate percent
                    if self.total_duration > 0:
                        percent = (current_time / self.total_duration) * 100
                        percent = max(0, min(99.9, percent)) # Clamp
                        
                        if percent > self.last_percent + 0.5: # Update every 0.5%
                            self.last_percent = percent
                            
                            # Format for existing frontend
                            # Frontend expects: percent (str or number), speed (str), eta (str)
                            self.progress_queue.put({
                                "type": "progress",
                                "percent": f"{percent:.1f}%",
                                "speed": "Processing",
                                "eta": "..."
                            })
            except Exception:
                pass

async def run_download_with_events(url, format_id, audio_only, websocket, output_dir=None, start_time=None, end_time=None):
    import yt_dlp
    
    progress_queue = queue.Queue()
    
    def progress_hook(d):
        # Debug: Print all keys and status to see what's happening
        status = d.get('status', 'unknown')
        print(f"[Debug Hook] Status: {status} | Keys: {list(d.keys())}")
        
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
            # NOTE: this fires once per stream, so for a video+audio download it
            # reports the pre-merge fragments (.f395.mp4, .f251.webm), which are
            # deleted once ffmpeg merges them. The real output path is resolved
            # after extract_info() returns and sent as the single finished_file.
            print(f"[Hook] Stream finished: {d.get('filename')}")
            progress_queue.put({"type": "info", "message": "Merging streams..."})
    
    await websocket.send_json({"type": "info", "message": "Download started..."})
    print("[WS] Sent download started info")
    
    # Clip Logic: Detect and optimize for 4K
    download_ranges = None
    total_duration = None

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
                    total_duration = s_end - s_start
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
                 total_duration = e_sec - s_sec
                 print(f"[Range] Custom range: {s_sec}-{e_sec}s")
                 await websocket.send_json({"type": "info", "message": f"Downloading Custom Range: {s_sec}s - {e_sec}s"})
             else:
                 await websocket.send_json({"type": "error", "message": "Start time must be less than end time"})
                 return

    if not output_dir:
        output_dir = os.path.join(Path.home(), "Downloads")
        
    os.makedirs(output_dir, exist_ok=True)
    
    # Use timestamp in filename
    cookie_file = os.path.join(current_dir, 'cookies.txt')
    if not os.path.exists(cookie_file):
        cookie_file = os.path.join(parent_dir, 'cookies.txt')
    # Check project root (parent of python_backend)
    if not os.path.exists(cookie_file):
        project_root = os.path.dirname(parent_dir)
        cookie_file = os.path.join(project_root, 'cookies.txt')

    # Create logger with awareness of total duration
    custom_logger = ProgressLogger(progress_queue, total_duration)

    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s_%(epoch)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'logger': custom_logger,
        'quiet': False,
        'no_warnings': True,
        'noprogress': False,
        'nocheckcertificate': True,
        # Deliberately NOT setting 'ignoreerrors'. With it on, yt-dlp swallows
        # failures and returns None instead of raising, so a failed download
        # reported success to the user.
        'noplaylist': True,
    }
    
    if os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
        print(f"[Cookies] Using file: {cookie_file}")
    else:
        ydl_opts['cookiesfrombrowser'] = ('chrome', )
        print("[Cookies] Using Chrome browser cookies")
    
    # YouTube signature solving needs a JS runtime. Let yt-dlp find Node on PATH
    # rather than assuming a fixed install location; only pin a path if the user
    # set one explicitly.
    node_path = os.environ.get('BENCH_NODE_PATH')
    if node_path:
        ydl_opts['js_runtimes'] = {'node': {'args': [node_path]}}

    # Fetching JS components from GitHub at download time is a network dependency
    # and a supply-chain surface, so it is opt-in rather than always on.
    if os.environ.get('BENCH_REMOTE_COMPONENTS') == '1':
        ydl_opts['remote_components'] = ['ejs:github']
    
    # Apply download ranges if this is a clip
    if download_ranges:
        ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, download_ranges)
        # Force 4K selection for clips if not audio-only
        if not audio_only and FFMPEG_AVAILABLE:
            # Match user's working script configuration exactly
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
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
                     # If user selected a specific format, try to respect it but ensure audio
                    ydl_opts['format'] = f'{format_id}+bestaudio/best'
                else:
                    # Default: Best quality (4K) using user's proven format string
                    ydl_opts['format'] = 'bestvideo[height>=2160]+bestaudio/bestvideo+bestaudio/best'
            
            # We still prefer MP4 container for compatibility where possible
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
                info = ydl.extract_info(url, download=True)

            # Resolve the final path *after* any merge/postprocessing, so the UI
            # gets the file that actually exists on disk.
            final_path = None
            if info:
                requested = info.get('requested_downloads') or []
                if requested:
                    final_path = requested[0].get('filepath') or requested[0].get('_filename')
                if not final_path:
                    final_path = info.get('filepath')

            if final_path and os.path.exists(final_path):
                progress_queue.put({"type": "finished_file", "file_path": final_path})
            else:
                print(f"[Download] Could not resolve final output path (got {final_path!r})")

            progress_queue.put({"type": "complete"})
        except Exception as e:
            download_error = tidy_error(e)
            progress_queue.put({"type": "error", "message": download_error})
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

    # Electron passes BENCH_PORT so the two sides always agree on the port.
    port = int(os.environ.get("BENCH_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
