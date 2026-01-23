import cv2
import subprocess
import json
import numpy as np
import os
import asyncio

def get_video_metadata(video_path):
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,bit_rate,codec_name,avg_frame_rate",
        "-of", "json",
        video_path
    ]
    # Ensure subprocess doesn't pop up a window on Windows
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    result = subprocess.run(cmd, capture_output=True, text=True, startupinfo=startupinfo)
    try:
        return json.loads(result.stdout)["streams"][0]
    except (KeyError, IndexError, json.JSONDecodeError):
        # Fallback or error if no video stream found
        return None

def get_quality_label(width, height):
    if width >= 3840:
        return "4K UHD"
    elif width >= 2560:
        return "2K QHD"
    elif width >= 1920:
        return "1080p Full HD"
    elif width >= 1280:
        return "720p HD"
    else:
        return "SD / Low quality"

def analyze_sharpness(video_path):
    cap = cv2.VideoCapture(video_path)
    sharpness = []

    # Sample up to 20 frames
    frame_count = 0
    while frame_count < 20:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Skip every few frames to get a better spread if video is long, 
        # but for simplicity/speed just read first 20 valid frames for now
        # or we could seek.
        
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        val = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness.append(val)
        frame_count += 1

    cap.release()
    if not sharpness:
        return 0.0
    return float(np.mean(sharpness))

def analyze_video(video_path: str):
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    meta = get_video_metadata(video_path)
    if not meta:
        raise ValueError("Could not extract video metadata (is it a valid video file?)")

    width = int(meta.get("width", 0))
    height = int(meta.get("height", 0))
    # Bitrate might be at format level, not stream level, but let's try stream first
    # If missing, it defaults to 'N/A' or similar in ffprobe depending on container
    bitrate_raw = meta.get("bit_rate")
    if bitrate_raw:
        bitrate = int(bitrate_raw) // 1000
    else:
        # Try getting format bitrate if stream bitrate is missing
        # For now just set to 0
        bitrate = 0
        
    codec = meta.get("codec_name", "unknown")
    try:
        fps = eval(meta.get("avg_frame_rate", "0"))
    except:
        fps = 0

    quality_label = get_quality_label(width, height)
    sharpness = analyze_sharpness(video_path)
    
    is_fake_4k = width >= 3840 and sharpness < 80
    is_upscaled_1080p = width >= 1920 and sharpness < 60
    
    warnings = []
    if is_fake_4k:
        warnings.append("Potential FAKE 4K (Upscaled)")
    elif is_upscaled_1080p:
        warnings.append("Potential Upscaled 1080p")

    return {
        "filename": os.path.basename(video_path),
        "resolution": f"{width}x{height}",
        "quality_label": quality_label,
        "fps": round(fps, 2),
        "codec": codec,
        "bitrate_kbps": bitrate,
        "sharpness_score": round(sharpness, 2),
        "warnings": warnings,
        "is_true_native": not warnings
    }
