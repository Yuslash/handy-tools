"""
video_editor.py
---------------
FastAPI router that exposes two SSE-streaming endpoints:

  POST /api/edit/trim  — stream-copy a time range from a local video
  POST /api/edit/crop  — spatially crop a local video (re-encode video stream)

Events follow the same schema as gif_converter so the frontend can reuse
the same streaming consumer:

    {"type": "status",   "message": "..."}
    {"type": "progress", "percent": 0-100}
    {"type": "complete", "output_path": "..."}
    {"type": "error",    "message": "..."}
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import re
import subprocess
import threading
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_ffmpeg() -> str | None:
    """Return the path to an ffmpeg executable, or None if unavailable."""
    import shutil
    return shutil.which("ffmpeg")


def _safe_output_path(source: Path, suffix: str) -> str:
    """
    Build an output path next to the source file that will not overwrite it.

    e.g. /videos/clip.mp4  → /videos/clip_trimmed.mp4
         (or clip_trimmed_1.mp4 if that exists too)
    """
    stem = source.stem
    ext  = source.suffix or ".mp4"
    parent = source.parent
    candidate = parent / f"{stem}{suffix}{ext}"
    counter = 1
    while candidate.exists():
        candidate = parent / f"{stem}{suffix}_{counter}{ext}"
        counter += 1
    return str(candidate)


def _parse_duration(stderr_output: str) -> float | None:
    """Extract video duration in seconds from ffmpeg -i stderr."""
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", stderr_output)
    if not m:
        return None
    h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mn * 60 + s


def _parse_time(time_str: str) -> float | None:
    """Parse HH:MM:SS or SS float → seconds."""
    if not time_str:
        return None
    parts = time_str.strip().split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except (ValueError, IndexError):
        return None


def _stream_ffmpeg(cmd: list[str], total_duration: float | None, event_queue: queue.Queue) -> None:
    """
    Run *cmd* in a subprocess, parse 'time=HH:MM:SS.mm' progress from stderr,
    and push events onto *event_queue*.
    """
    try:
        proc = subprocess.Popen(
            cmd,
            stderr=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert proc.stderr is not None

        stderr_buf = ""
        last_pct = -1.0

        for line in proc.stderr:
            stderr_buf += line
            m = re.search(r"time=\s*(\d+:\d+:\d+\.\d+|\d+\.\d+)", line)
            if m and total_duration and total_duration > 0:
                t = _parse_time(m.group(1))
                if t is not None:
                    pct = min(99.0, (t / total_duration) * 100)
                    if pct - last_pct >= 1.0:
                        last_pct = pct
                        event_queue.put({"type": "progress", "percent": round(pct, 1)})

        proc.wait()
        if proc.returncode != 0:
            # Grab last useful lines from stderr for diagnostics
            tail = "\n".join(stderr_buf.splitlines()[-10:])
            raise RuntimeError(f"FFmpeg exited with code {proc.returncode}.\n{tail}")

    except Exception as exc:
        event_queue.put({"type": "error", "message": str(exc)})
        return

    event_queue.put({"type": "_done"})


async def _sse_generator(event_queue: queue.Queue, output_path: str):
    """Drain *event_queue* and yield SSE-formatted lines."""
    while True:
        try:
            event = event_queue.get_nowait()
        except queue.Empty:
            await asyncio.sleep(0.05)
            continue

        if event["type"] == "_done":
            yield f"data:{json.dumps({'type': 'complete', 'output_path': output_path})}\n\n"
            break
        elif event["type"] == "error":
            yield f"data:{json.dumps(event)}\n\n"
            break
        else:
            yield f"data:{json.dumps(event)}\n\n"


def _get_video_duration(file_path: str) -> float | None:
    """Run ffmpeg -i and parse the Duration: line from stderr."""
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        return None
    try:
        result = subprocess.run(
            [ffmpeg, "-i", file_path],
            stderr=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
        return _parse_duration(result.stderr)
    except Exception:
        return None


def _get_video_dimensions(file_path: str) -> tuple[int, int] | None:
    """Run ffprobe to get video width and height."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        file_path,
    ]
    try:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        res = subprocess.run(cmd, capture_output=True, text=True, startupinfo=startupinfo, timeout=10)
        out = res.stdout.strip()
        if out and 'x' in out:
            parts = out.split('x')
            return int(parts[0]), int(parts[1])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TrimRequest(BaseModel):
    file_path: str
    start_time: str = "0"   # e.g. "00:01:30" or "90"
    end_time: str           # e.g. "00:02:00" or "120"


class CropRequest(BaseModel):
    file_path: str
    x: int
    y: int
    width: int
    height: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.api_route("/stream_video", methods=["GET", "HEAD"])
async def stream_video(path: str):
    """
    Stream a local video file over HTTP with Range support so Chromium HTML5 <video>
    can seek, play, and load local files without security/CORS restrictions.
    """
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video file not found.")

    return FileResponse(path, media_type="video/mp4")


@router.post("/edit/trim")
async def trim_video(req: TrimRequest):
    """
    Stream-copy a time range from *file_path* to a new file.
    Uses `-c copy` — no re-encoding, so it is nearly instant.
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="FFmpeg is not installed or not on PATH.")

    source = Path(req.file_path)
    if not source.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"File not found: {req.file_path}")

    start_sec = _parse_time(req.start_time)
    end_sec   = _parse_time(req.end_time)
    if start_sec is None or end_sec is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid start_time or end_time.")
    if end_sec <= start_sec:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="end_time must be after start_time.")

    output_path    = _safe_output_path(source, "_trimmed")
    total_duration = end_sec - start_sec

    cmd = [
        ffmpeg, "-y",
        "-i", str(source),
        "-ss", req.start_time,
        "-to", req.end_time,
        "-c", "copy",
        output_path,
    ]

    event_queue: queue.Queue = queue.Queue()

    def _run():
        event_queue.put({"type": "status", "message": f"Trimming {int(total_duration)}s…"})
        _stream_ffmpeg(cmd, total_duration, event_queue)

    threading.Thread(target=_run, daemon=True).start()

    return StreamingResponse(
        _sse_generator(event_queue, output_path),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/edit/crop")
async def crop_video(req: CropRequest):
    """
    Crop *file_path* to the given rectangle.
    Video stream is re-encoded (libx264 fast); audio is stream-copied.
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="FFmpeg is not installed or not on PATH.")

    source = Path(req.file_path)
    if not source.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"File not found: {req.file_path}")

    if req.width <= 0 or req.height <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Width and height must be positive.")

    output_path    = _safe_output_path(source, "_cropped")
    total_duration = _get_video_duration(str(source))

    x, y, w, h = req.x, req.y, req.width, req.height
    dims = _get_video_dimensions(str(source))
    if dims:
        vid_w, vid_h = dims
        x = max(0, min(vid_w - 2, x))
        y = max(0, min(vid_h - 2, y))
        w = max(2, min(vid_w - x, w))
        h = max(2, min(vid_h - y, h))

    # libx264 (yuv420p) requires even dimensions
    if w % 2 != 0:
        w -= 1
    if h % 2 != 0:
        h -= 1

    crop_filter = f"crop={w}:{h}:{x}:{y}"
    cmd = [
        ffmpeg, "-y",
        "-i", str(source),
        "-vf", crop_filter,
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "fast",
        "-c:a", "copy",
        output_path,
    ]

    event_queue: queue.Queue = queue.Queue()

    def _run():
        event_queue.put({"type": "status", "message": f"Cropping to {req.width}×{req.height}…"})
        _stream_ffmpeg(cmd, total_duration, event_queue)

    threading.Thread(target=_run, daemon=True).start()

    return StreamingResponse(
        _sse_generator(event_queue, output_path),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
