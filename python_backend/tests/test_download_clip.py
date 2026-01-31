import yt_dlp
import os
import sys

def download_clip_as_range():
    # Hardcoded details for reliability
    video_id = "8hRuboBwb9g"
    # Timestamps from previous analysis (Start: 1412.0, Duration: 22.498)
    start_time = 1412.0 
    end_time = 1412.0 + 22.5 
    
    # Create downloads directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, "downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    main_video_url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"Target Main Video: {main_video_url}")
    print(f"Clip Range: {start_time} - {end_time}")
    print(f"Output Directory: {output_dir}")
    print("Attempting to download 4K segment...")

    ydl_opts = {
        'format': 'bestvideo[height>=2160]+bestaudio/bestvideo+bestaudio/best',
        'outtmpl': os.path.join(output_dir, 'wuwa-test.%(ext)s'),
        'verbose': True,
        # Use simple download ranges on the main video
        'download_ranges': yt_dlp.utils.download_range_func(None, [(start_time, end_time)]),
        'force_keyframes_at_cuts': False, 
        # Standard web client usually works best for main videos unless restricted
        # If 403, we can try android, but main video usually ok?
        # Let's try default first, if 403 then 'android'.
        # Actually, let's keep 'android' as backup or primary if web fails?
        # Previous crash was on 'android' clip extract.
        # Let's try default (web) first.
        'nocheckcertificate': True,
        'ignoreerrors': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([main_video_url])
            print(f"\n✅ Download complete.")
    except Exception as e:
        print(f"\n❌ Error during download: {e}")

if __name__ == "__main__":
    download_clip_as_range()
