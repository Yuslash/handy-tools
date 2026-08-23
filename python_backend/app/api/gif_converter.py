from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.gif import GifRequest
import os
import asyncio
import queue
import threading
import json
import shutil
import subprocess
import re
from pathlib import Path
from app.core.utils import parse_time_to_seconds

router = APIRouter()


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


def process_gif_conversion_with_progress(
    file_path: str,
    output_path: str,
    start_time: str,
    end_time: str,
    fps: int,
    width: int,
    progress_queue: queue.Queue,
    high_quality: bool = True,
):
    """
    Convert video to high-quality palette-based GIF using FFmpeg with real-time SSE progress reporting.
    Handles 60fps, custom resolutions, and WebM recordings flawlessly.
    """
    ffmpeg_bin = _find_ffmpeg()
    
    if ffmpeg_bin:
        try:
            progress_queue.put({"type": "status", "message": "Analyzing video stream..."})
            
            start_sec = parse_time_to_seconds(start_time) if start_time and str(start_time).strip() else None
            end_sec = parse_time_to_seconds(end_time) if end_time and str(end_time).strip() else None
            
            duration = _get_video_duration(file_path, ffmpeg_bin)
            
            # Ensure width and height scaling (use -2 so height is rounded to an even integer)
            if width and width > 0:
                scale_filter = f"scale={width}:-2:flags=lanczos"
            else:
                scale_filter = "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos"
                
            fps_val = fps if fps and fps > 0 else 15
            
            # High-quality full palette generation vs standard palette
            if high_quality:
                palettegen_opts = "max_colors=256:stats_mode=full:reserve_transparent=0"
                paletteuse_opts = "dither=floyd_steinberg:diff_mode=rectangle"
            else:
                palettegen_opts = "max_colors=192:stats_mode=diff"
                paletteuse_opts = "dither=bayer:bayer_scale=4"
            
            vf = (
                f"fps={fps_val},{scale_filter},split[s0][s1];"
                f"[s0]palettegen={palettegen_opts}[p];"
                f"[s1][p]paletteuse={paletteuse_opts}"
            )
            
            cmd = [ffmpeg_bin, "-y"]
            if start_sec is not None:
                cmd.extend(["-ss", str(start_sec)])
            if end_sec is not None:
                cmd.extend(["-to", str(end_sec)])
            
            cmd.extend(["-i", file_path, "-vf", vf, output_path])
            
            total_sec = 10.0
            if duration is not None and duration > 0:
                s = start_sec or 0
                e = min(end_sec, duration) if end_sec else duration
                total_sec = max(0.5, e - s)
            elif start_sec is not None and end_sec is not None and end_sec > start_sec:
                total_sec = end_sec - start_sec
            
            dim_label = f"{width}px" if width and width > 0 else "Native"
            quality_label = "High Quality (60fps)" if (high_quality and fps_val >= 60) else ("High Quality" if high_quality else "Standard")
            progress_queue.put({"type": "status", "message": f"Rendering {fps_val} fps GIF [{dim_label}, {quality_label}]..."})
            
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
                        pct = min(96, max(1, int((cur_sec / total_sec) * 100)))
                        if pct != last_percent:
                            last_percent = pct
                            progress_queue.put({
                                "type": "progress",
                                "percent": pct,
                                "message": f"Rendering frames… ({pct}%)",
                            })
            
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"FFmpeg conversion failed (exit code {proc.returncode})")
            
            progress_queue.put({
                "type": "complete",
                "output_path": output_path,
            })
            return True
        except Exception as e:
            print(f"[GIF] FFmpeg Error: {e}", flush=True)
            progress_queue.put({
                "type": "error",
                "message": str(e),
            })
            raise e
    else:
        # Fallback to moviepy if ffmpeg is missing from PATH
        try:
            from moviepy import VideoFileClip
            clip = VideoFileClip(file_path)
            if width and width > 0:
                clip = clip.resized(width=width)
            clip.write_gif(output_path, fps=fps, logger=None)
            clip.close()
            progress_queue.put({
                "type": "complete",
                "output_path": output_path,
            })
            return True
        except Exception as e:
            progress_queue.put({
                "type": "error",
                "message": str(e),
            })
            raise e


def process_gif_conversion(file_path: str, output_path: str, start_time: str, end_time: str, fps: int, width: int):
    """Synchronous function to handle GIF processing."""
    q = queue.Queue()
    return process_gif_conversion_with_progress(
        file_path, output_path, start_time, end_time, fps, width, q
    )


@router.post("/convert_gif_stream")
async def convert_to_gif_stream(request: GifRequest):
    """
    SSE endpoint for GIF conversion with real-time progress updates.
    """
    print(f"[GIF-SSE] Received request: {request}", flush=True)
    
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=400, detail="Input file not found")

    # Generate output path if not provided
    if not request.output_path:
        try:
            input_path_obj = Path(request.file_path)
            output_filename = f"{input_path_obj.stem}_converted.gif"
            request.output_path = str(input_path_obj.parent / output_filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Path generation failed: {e}")

    progress_queue = queue.Queue()
    conversion_done = threading.Event()

    def run_conversion():
        try:
            process_gif_conversion_with_progress(
                request.file_path,
                request.output_path,
                request.start_time,
                request.end_time,
                request.fps,
                request.width,
                progress_queue,
                high_quality=request.high_quality,
            )
        except Exception as e:
            print(f"[GIF] Conversion exception: {e}", flush=True)
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


@router.post("/convert_gif")
async def convert_to_gif(request: GifRequest):
    """Legacy endpoint without progress."""
    print(f"[GIF] Received request: {request}", flush=True)
    
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=400, detail="Input file not found")

    if not request.output_path:
        try:
            input_path_obj = Path(request.file_path)
            output_filename = f"{input_path_obj.stem}_converted.gif"
            request.output_path = str(input_path_obj.parent / output_filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Path generation failed: {e}")

    try:
        await asyncio.to_thread(
            process_gif_conversion,
            request.file_path,
            request.output_path,
            request.start_time,
            request.end_time,
            request.fps,
            request.width,
        )
        
        return {
            "status": "success",
            "output_path": request.output_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
