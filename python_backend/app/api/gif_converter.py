from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.gif import GifRequest
import os
import asyncio
import queue
import threading
import json
from pathlib import Path
from app.core.utils import parse_time_to_seconds
from moviepy import VideoFileClip
from proglog import ProgressBarLogger

router = APIRouter()


class GifProgressLogger(ProgressBarLogger):
    """Custom logger to capture moviepy progress and send to a queue."""
    
    def __init__(self, progress_queue):
        super().__init__()
        self.progress_queue = progress_queue
        self.last_percent = -1
        self.finalizing_sent = False
    
    def callback(self, **changes):
        """Called for any progress updates."""
        # Debug output
        # print(f"[GIF-Progress] callback changes: {changes}", flush=True)
        
        # Check for bar updates
        for key, value in changes.items():
            if key.startswith('bars') and isinstance(value, dict):
                for bar_name, bar_data in value.items():
                    if isinstance(bar_data, dict) and 'index' in bar_data and 'total' in bar_data:
                        index = bar_data['index']
                        total = bar_data['total']
                        if total > 0:
                            percentage = int((index / total) * 100)
                            if percentage != self.last_percent:
                                self.last_percent = percentage
                                self.progress_queue.put({
                                    "type": "progress",
                                    "percent": percentage,
                                    "frame": index,
                                    "total_frames": total
                                })
    
    def bars_callback(self, bar, attr, value, old_value=None):
        """Called when progress bars are updated."""
        # Debug: print all callbacks to see what we get
        # print(f"[GIF-Progress] bars_callback: bar={bar}, attr={attr}, value={value}", flush=True)
        
        if attr == 'index' and bar in self.bars:
            total = self.bars[bar].get('total', 0)
            if total > 0:
                percentage = int((value / total) * 100)
                # Only send if percentage changed to reduce spam
                if percentage != self.last_percent:
                    self.last_percent = percentage
                    self.progress_queue.put({
                        "type": "progress",
                        "percent": percentage,
                        "frame": value,
                        "total_frames": total
                    })
                
                if percentage == 100 and not self.finalizing_sent:
                    self.finalizing_sent = True
                    self.progress_queue.put({"type": "status", "message": "Finalizing GIF..."})


def process_gif_conversion_with_progress(file_path: str, output_path: str, start_time: str, end_time: str, fps: int, width: int, progress_queue: queue.Queue):
    """
    Synchronous function to handle MoviePy processing with progress reporting.
    Uses manual frame iteration for accurate progress tracking.
    """
    clip = None
    try:
        progress_queue.put({"type": "status", "message": "Loading video file..."})
        
        # Load the videofile
        clip = VideoFileClip(file_path)
        
        # Handle Subclipping
        start_sec = 0
        end_sec = clip.duration
        
        if start_time and start_time.strip():
            converted_start = parse_time_to_seconds(start_time)
            if converted_start is not None:
                start_sec = converted_start

        if end_time and end_time.strip():
            converted_end = parse_time_to_seconds(end_time)
            if converted_end is not None:
                end_sec = converted_end
        
        # Apply subclip if range is valid and different from full duration
        if start_sec != 0 or end_sec != clip.duration:
            end_sec = min(end_sec, clip.duration)
            if start_sec < end_sec:
                print(f"[GIF] Cutting clip: {start_sec} to {end_sec}")
                progress_queue.put({"type": "status", "message": f"Trimming: {start_sec}s to {end_sec}s"})
                clip = clip.subclipped(start_sec, end_sec)
        
        # Resize
        if width and width > 0:
            print(f"[GIF] Resizing to width: {width}px")
            progress_queue.put({"type": "status", "message": f"Resizing to {width}px width..."})
            clip = clip.resized(width=width)
        
        # Calculate total frames
        total_frames = int(clip.duration * fps)
        print(f"[GIF] Total frames to process: {total_frames} (duration: {clip.duration}s, fps: {fps})")
        
        progress_queue.put({"type": "status", "message": f"Converting {total_frames} frames to GIF..."})
        
        # Custom logger
        logger = GifProgressLogger(progress_queue)
        
        # Use MoviePy's standard write_gif with our custom logger
        clip.write_gif(output_path, fps=fps, logger=logger)
        
        print(f"[GIF] Successfully wrote GIF to {output_path}")
        
        progress_queue.put({
            "type": "complete",
            "output_path": output_path
        })
        
        return True
    except Exception as e:
        print(f"[GIF] MoviePy Error: {e}")
        progress_queue.put({
            "type": "error",
            "message": str(e)
        })
        raise e
    finally:
        if clip:
            clip.close()


def process_gif_conversion(file_path: str, output_path: str, start_time: str, end_time: str, fps: int, width: int):
    """
    Synchronous function to handle MoviePy processing (legacy, no progress).
    """
    clip = None
    try:
        clip = VideoFileClip(file_path)
        
        start_sec = 0
        end_sec = clip.duration
        
        if start_time and start_time.strip():
            converted_start = parse_time_to_seconds(start_time)
            if converted_start is not None:
                start_sec = converted_start

        if end_time and end_time.strip():
            converted_end = parse_time_to_seconds(end_time)
            if converted_end is not None:
                end_sec = converted_end
        
        if start_sec != 0 or end_sec != clip.duration:
            end_sec = min(end_sec, clip.duration)
            if start_sec < end_sec:
                print(f"[GIF] Cutting clip: {start_sec} to {end_sec}")
                clip = clip.subclipped(start_sec, end_sec)
        
        if width and width > 0:
            print(f"[GIF] Resizing to width: {width}px")
            clip = clip.resized(width=width)
            
        print(f"[GIF] Writing GIF to {output_path} (FPS: {fps})")
        clip.write_gif(output_path, fps=fps, logger=None)
        
        return True
    except Exception as e:
        print(f"[GIF] MoviePy Error: {e}")
        raise e
    finally:
        if clip:
            clip.close()


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
    conversion_error = None

    def run_conversion():
        nonlocal conversion_error
        try:
            process_gif_conversion_with_progress(
                request.file_path,
                request.output_path,
                request.start_time,
                request.end_time,
                request.fps,
                request.width,
                progress_queue
            )
        except Exception as e:
            conversion_error = str(e)
        finally:
            conversion_done.set()

    async def event_generator():
        # Start conversion in background thread
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
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/convert_gif")
async def convert_to_gif(request: GifRequest):
    """Legacy endpoint without progress (for backwards compatibility)."""
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
            request.width
        )
        
        return {
            "status": "success",
            "output_path": request.output_path
        }
    except OSError as e:
        print(f"[GIF] Video Error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid video file: {e}")
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
