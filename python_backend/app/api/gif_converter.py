from fastapi import APIRouter, HTTPException
from app.schemas.gif import GifRequest
import os
import asyncio
from pathlib import Path
from app.core.utils import parse_time_to_seconds
from moviepy import VideoFileClip

router = APIRouter()

def process_gif_conversion(file_path: str, output_path: str, start_time: str, end_time: str, fps: int, width: int):
    """
    Synchronous function to handle MoviePy processing.
    """
    clip = None
    try:
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
            # Ensure end_sec is not longer than duration
            end_sec = min(end_sec, clip.duration)
            if start_sec < end_sec:
                print(f"[GIF] Cutting clip: {start_sec} to {end_sec}")
                clip = clip.subclipped(start_sec, end_sec)
        
        # Resize
        if width and width > 0:
            print(f"[GIF] Resizing to width: {width}px")
            clip = clip.resized(width=width)
            
        print(f"[GIF] Writing GIF to {output_path} (FPS: {fps})")
        clip.write_gif(output_path, fps=fps, verbose=False, logger=None)
        
        return True
    except Exception as e:
        print(f"[GIF] MoviePy Error: {e}")
        raise e
    finally:
        if clip:
            clip.close()

@router.post("/convert_gif")
async def convert_to_gif(request: GifRequest):
    print(f"[GIF] Received request: {request}", flush=True)
    
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

    try:
        # Run the blocking moviepy code in a separate thread
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
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
