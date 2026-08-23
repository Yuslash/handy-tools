"""
record_tracker.py
-----------------
FastAPI router for real-time cursor tracking, global hotkey detection,
and high-definition MP4 video conversion.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Windows Native Cursor & Hotkey Detection
# ---------------------------------------------------------------------------

VK_MAP = {
    # Browser-safe zero-conflict mouse & keys
    "middle_mouse": 0x04,  # Middle Mouse Button / Scroll Wheel Press
    "mouse_middle": 0x04,
    "mouse4": 0x05,        # Mouse Side Button 1 (Back)
    "mouse5": 0x06,        # Mouse Side Button 2 (Forward)
    "tilde": 0xC0,         # ` / ~ (Tilde Key)
    "backquote": 0xC0,
    "capslock": 0x14,      # Caps Lock
    "f2": 0x71,
    "f4": 0x73,
    "f6": 0x75,
    "f8": 0x77,
    "z": 0x5A,
    "c": 0x43,
    "x": 0x58,
    "v": 0x56,
    "q": 0x51,
    "e": 0x45,
    "d": 0x44,
    "f": 0x46,
    # Standard modifier keys
    "ctrl": 0x11,
    "control": 0x11,
    "alt": 0x12,
    "shift": 0x10,
    "space": 0x20,
    "tab": 0x09,
}

if sys.platform == "win32":
    import ctypes

    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    def _get_cursor_pos() -> tuple[int, int]:
        pt = POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        return pt.x, pt.y

    def _is_key_pressed(key_name: str) -> bool:
        normalized = key_name.lower().strip()
        vk = VK_MAP.get(normalized, 0x11)
        return bool(ctypes.windll.user32.GetAsyncKeyState(vk) & 0x8000)
else:
    def _get_cursor_pos() -> tuple[int, int]:
        return 0, 0

    def _is_key_pressed(key_name: str) -> bool:
        return False


# ---------------------------------------------------------------------------
# Real-time Cursor & Hotkey SSE Tracker
# ---------------------------------------------------------------------------

@router.get("/record/track_stream")
async def track_stream(
    key: str = Query(default="ctrl"),
):
    """
    Stream real-time mouse cursor position and hotkey hold state at ~120Hz.
    Used by the canvas zoom engine to smoothly pan/zoom into the mouse cursor.
    """
    async def event_generator():
        try:
            while True:
                x, y = _get_cursor_pos()
                pressed = _is_key_pressed(key)

                payload = {"x": x, "y": y, "pressed": pressed}
                yield f"data: {json.dumps(payload)}\n\n"

                # High-frequency ~120 Hz update rate (8ms)
                await asyncio.sleep(0.008)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Video Conversion (WebM -> MP4)
# ---------------------------------------------------------------------------

class VideoConvertRequest(BaseModel):
    file_path: str
    output_path: Optional[str] = None
    fps: int = 30
    width: int = 0


def _find_ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def _get_video_duration(file_path: str, ffmpeg_bin: str) -> float | None:
    try:
        cmd = [ffmpeg_bin, "-i", file_path]
        res = subprocess.run(
            cmd,
            stderr=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", res.stderr)
        if m:
            h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            return h * 3600 + mn * 60 + s
    except Exception:
        pass
    return None


def process_video_conversion_with_progress(
    file_path: str,
    output_path: str,
    fps: int,
    width: int,
    progress_queue: queue.Queue,
):
    """
    Convert recorded WebM to pristine H.264 MP4 using FFmpeg.
    """
    ffmpeg_bin = _find_ffmpeg()
    if not ffmpeg_bin:
        raise RuntimeError("FFmpeg executable not found on system.")

    try:
        progress_queue.put({"type": "status", "message": "Analyzing recorded video stream..."})
        duration = _get_video_duration(file_path, ffmpeg_bin)

        # Scale filter if width specified
        vf_parts = []
        if width and width > 0:
            vf_parts.append(f"scale={width}:-2:flags=lanczos")
        else:
            vf_parts.append("scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos")

        if fps and fps > 0:
            vf_parts.append(f"fps={fps}")

        vf = ",".join(vf_parts)

        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            file_path,
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "fast",
            "-movflags",
            "+faststart",
            output_path,
        ]

        total_sec = duration if (duration and duration > 0) else 10.0
        dim_str = f"{width}px" if width > 0 else "Native"
        progress_queue.put({"type": "status", "message": f"Encoding MP4 Video [{dim_str}, {fps} fps]..."})

        proc = subprocess.Popen(
            cmd,
            stderr=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        time_pattern = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")
        last_percent = -1

        if proc.stderr:
            for line in proc.stderr:
                m = time_pattern.search(line)
                if m:
                    h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
                    cur_sec = h * 3600 + mn * 60 + s
                    pct = min(98, max(1, int((cur_sec / total_sec) * 100)))
                    if pct != last_percent:
                        last_percent = pct
                        progress_queue.put({
                            "type": "progress",
                            "percent": pct,
                            "message": f"Encoding video… ({pct}%)",
                        })

        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg MP4 encoding failed with code {proc.returncode}")

        progress_queue.put({
            "type": "complete",
            "output_path": output_path,
        })
        return True
    except Exception as e:
        print(f"[Video-Encode] Error: {e}", flush=True)
        progress_queue.put({
            "type": "error",
            "message": str(e),
        })
        raise e


@router.post("/record/convert_video_stream")
async def convert_video_stream(request: VideoConvertRequest):
    """
    SSE endpoint for MP4 video conversion with real-time progress updates.
    """
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=400, detail="Input file not found")

    if not request.output_path:
        input_path_obj = Path(request.file_path)
        output_filename = f"{input_path_obj.stem}_recording.mp4"
        request.output_path = str(input_path_obj.parent / output_filename)

    progress_queue = queue.Queue()
    conversion_done = threading.Event()

    def run_conversion():
        try:
            process_video_conversion_with_progress(
                request.file_path,
                request.output_path,
                request.fps,
                request.width,
                progress_queue,
            )
        except Exception as e:
            print(f"[Video-Encode] Exception: {e}", flush=True)
        finally:
            conversion_done.set()

    async def event_generator():
        thread = threading.Thread(target=run_conversion)
        thread.start()

        while not conversion_done.is_set() or not progress_queue.empty():
            try:
                msg = progress_queue.get(timeout=0.1)
                yield f"data: {json.dumps(msg)}\n\n"

                if msg.get("type") in ["complete", "error"]:
                    break
            except queue.Empty:
                await asyncio.sleep(0.05)

        thread.join(timeout=2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
