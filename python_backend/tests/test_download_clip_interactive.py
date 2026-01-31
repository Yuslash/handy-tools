import yt_dlp
import os
import sys

def parse_time_to_seconds(time_str):
    """
    Converts a time string in format 'HH:MM:SS', 'MM:SS', or 'SS' to total seconds.
    """
    try:
        parts = list(map(float, time_str.strip().split(':')))
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        elif len(parts) == 1:
            return parts[0]
        else:
            raise ValueError("Invalid time format")
    except Exception as e:
        print(f"Error parsing time '{time_str}': {e}")
        return None

def download_clip_interactive():
    print("--- 4K YouTube Clip Downloader ---")
    
    # 1. Get Video URL
    video_url = input("Enter YouTube Video URL: ").strip()
    if not video_url:
        print("URL cannot be empty.")
        return

    # 2. Get Start Time
    start_str = input("Enter Start Time (e.g., 16:00 or 1:16:00): ").strip()
    start_seconds = parse_time_to_seconds(start_str)
    if start_seconds is None:
        return

    # 3. Get End Time
    end_str = input("Enter End Time (e.g., 18:50 or 1:18:50): ").strip()
    end_seconds = parse_time_to_seconds(end_str)
    if end_seconds is None:
        return
        
    if end_seconds <= start_seconds:
        print("End time must be greater than start time.")
        return

    print(f"\nTarget: {video_url}")
    print(f"Segment: {start_seconds}s to {end_seconds}s (Duration: {end_seconds - start_seconds}s)")
    
    # Create downloads directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, "downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Output Directory: {output_dir}")
    print("Initializing download (Targeting 4K/Best Quality)...")

    # yt-dlp options
    ydl_opts = {
        # Select best video (up to 4K/2160p) + best audio
        'format': 'bestvideo[height>=2160]+bestaudio/bestvideo+bestaudio/best',
        # Output filename template
        'outtmpl': os.path.join(output_dir, 'Clip_%(title)s_%(id)s.%(ext)s'),
        'verbose': True,
        # Download specific range
        'download_ranges': yt_dlp.utils.download_range_func(None, [(start_seconds, end_seconds)]),
        # Do not force keyframes (less precise cuts but original quality) - set to True if you want precise cuts but potential re-encoding
        'force_keyframes_at_cuts': False,
        'nocheckcertificate': True,
        'ignoreerrors': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
            print(f"\n✅ Download complete!")
    except Exception as e:
        print(f"\n❌ Error during download: {e}")

if __name__ == "__main__":
    download_clip_interactive()
