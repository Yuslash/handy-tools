import sys
import os
import re
import json
import platform
import subprocess
from pathlib import Path
from urllib.parse import urlparse
import time

# Try to import yt-dlp
YT_DLP_AVAILABLE = False
yt_dlp = None

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False


def check_ffmpeg():
    """Check if ffmpeg is available"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, text=True)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.SubprocessError):
        return False


def check_and_install_yt_dlp():
    """Check if yt-dlp is available, install if not"""
    global YT_DLP_AVAILABLE, yt_dlp
    
    if YT_DLP_AVAILABLE:
        try:
            print(f"✅ yt-dlp {yt_dlp.version.__version__} available")
            return True
        except:
            pass
    
    print("❌ yt-dlp not found. Installing...")
    try:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp", "--upgrade", "--quiet"])
        print("✅ yt-dlp installed successfully")
        
        # Try importing again
        try:
            import yt_dlp
            yt_dlp = yt_dlp
            YT_DLP_AVAILABLE = True
            return True
        except:
            YT_DLP_AVAILABLE = False
            return False
    except Exception as e:
        print(f"❌ Failed to install yt-dlp: {e}")
        print("   Please install manually: pip install yt-dlp")
        return False


def install_ffmpeg_windows():
    """Guide user to install ffmpeg on Windows"""
    print("\n🔧 FFmpeg is required for merging video and audio streams")
    print("=" * 60)
    print("To install ffmpeg on Windows:")
    print("1. Download from: https://www.gyan.dev/ffmpeg/builds/")
    print("2. Choose 'ffmpeg-release-full.7z'")
    print("3. Extract to C:\\ffmpeg")
    print("4. Add C:\\ffmpeg\\bin to your PATH")
    print("\nOr use winget (Windows 10/11):")
    print("   winget install Gyan.FFmpeg")
    print("\nWithout ffmpeg, downloads may be video-only or audio-only")
    print("=" * 60)
    
    choice = input("\nContinue without ffmpeg? (y/n): ").strip().lower()
    return choice == 'y'


class MyLogger:
    """Custom logger for yt-dlp"""
    def debug(self, msg):
        if msg.startswith('[debug]'):
            pass
        elif 'Downloading' in msg or 'destination' in msg or 'Merging' in msg:
            print(f"   {msg}")
    
    def info(self, msg):
        if msg and not msg.startswith('[debug]'):
            print(f"   {msg}")
    
    def warning(self, msg):
        if "ffmpeg" not in msg.lower():  # Filter ffmpeg warnings
            print(f"⚠️  {msg}")
    
    def error(self, msg):
        print(f"❌ {msg}")


def progress_hook(d):
    """Progress hook for yt-dlp"""
    if d['status'] == 'downloading':
        if '_percent_str' in d:
            percent = d['_percent_str']
            speed = d.get('_speed_str', 'N/A')
            eta = d.get('_eta_str', 'N/A')
            print(f"\r   {percent} at {speed} ETA: {eta}", end='', flush=True)
    elif d['status'] == 'finished':
        print(f"\n✅ Download completed")
        if 'filename' in d:
            filename = os.path.basename(d['filename'])
            if len(filename) > 40:
                filename = filename[:37] + "..."
            print(f"   Saved as: {filename}")
    elif d['status'] == 'error':
        print(f"\n❌ Error during download")


def get_video_info(url):
    """Get video information using yt-dlp Python API"""
    if not YT_DLP_AVAILABLE:
        return None
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'ignoreerrors': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info
    except Exception as e:
        print(f"❌ Error getting video info: {e}")
        return None


def list_available_formats(info):
    """List all available formats from video info"""
    if not info or 'formats' not in info:
        return []
    
    formats = []
    ffmpeg_available = check_ffmpeg()
    
    # Try to get adaptive formats (separate video/audio)
    for fmt in info['formats']:
        format_id = fmt.get('format_id', 'N/A')
        ext = fmt.get('ext', 'N/A')
        resolution = 'N/A'
        filesize = fmt.get('filesize', fmt.get('filesize_approx', 0))
        vcodec = fmt.get('vcodec', 'none')
        acodec = fmt.get('acodec', 'none')
        
        # Get resolution
        if fmt.get('height'):
            width = fmt.get('width', '?')
            height = fmt.get('height')
            resolution = f"{width}x{height}"
        elif fmt.get('height') is None and fmt.get('width') is None:
            resolution = 'Audio only'
        
        # Determine type
        if vcodec != 'none' and acodec != 'none':
            fmt_type = 'Video+Audio'
        elif vcodec != 'none':
            fmt_type = 'Video only'
        else:
            fmt_type = 'Audio only'
        
        # Get format note
        format_note = fmt.get('format_note', '')
        if format_note and len(format_note) > 20:
            format_note = format_note[:20] + '...'
        
        # Check if this format requires ffmpeg
        requires_ffmpeg = False
        if fmt_type == 'Video only' and not ffmpeg_available:
            requires_ffmpeg = True
        
        formats.append({
            'id': format_id,
            'type': fmt_type,
            'ext': ext,
            'resolution': resolution,
            'size': filesize,
            'vcodec': vcodec,
            'acodec': acodec,
            'note': format_note,
            'requires_ffmpeg': requires_ffmpeg,
            'format_note': fmt.get('format_note', '')
        })
    
    return formats


def format_size(size_bytes):
    """Format file size in human readable format"""
    if not size_bytes or size_bytes == 0:
        return "Unknown"
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def download_video_ytdlp(url, quality=None, output_dir=None):
    """Download video using yt-dlp Python API"""
    if not YT_DLP_AVAILABLE:
        print("❌ yt-dlp is not available")
        return False
    
    if output_dir is None:
        output_dir = os.path.join(Path.home(), "Downloads")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Check ffmpeg
    ffmpeg_available = check_ffmpeg()
    if not ffmpeg_available:
        print("⚠️  FFmpeg not found. Some downloads may be video-only or audio-only.")
        print("   Install ffmpeg for complete video+audio downloads.")
    
    # Build options
    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'logger': MyLogger(),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': False,
        'ignoreerrors': True,
    }
    
    # If ffmpeg is not available, avoid formats that require merging
    if not ffmpeg_available:
        ydl_opts['merge_output_format'] = None
        # Try to get pre-merged formats
        if not quality:
            ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        else:
            ydl_opts['format'] = quality
    else:
        # Use normal format selection with ffmpeg
        if quality:
            ydl_opts['format'] = quality
        else:
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
    
    print(f"\n📥 Starting download...")
    print(f"📁 Output directory: {output_dir}")
    if quality:
        print(f"🎬 Selected quality: {quality}")
    print("-" * 50)
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Get info first to show title
            info = ydl.extract_info(url, download=False)
            if info:
                title = info.get('title', 'Unknown')
                if len(title) > 50:
                    title = title[:47] + "..."
                print(f"📹 Title: {title}")
                print(f"⏱️ Duration: {info.get('duration_string', 'Unknown')}")
            
            # Start download
            ydl.download([url])
        
        print("\n✅ Download completed successfully!")
        return True
        
    except yt_dlp.utils.DownloadError as e:
        if "ffmpeg" in str(e).lower():
            print(f"\n❌ FFmpeg error: {e}")
            print("   Please install ffmpeg or try a different format.")
            return False
        else:
            print(f"\n❌ Download error: {e}")
            return False
    except KeyboardInterrupt:
        print("\n\n⚠️  Download interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Error during download: {e}")
        return False


def simple_download(url, output_dir=None):
    """Simple download without format selection for quick use"""
    if not YT_DLP_AVAILABLE:
        print("❌ yt-dlp is not available")
        return False
    
    if output_dir is None:
        output_dir = os.path.join(Path.home(), "Downloads")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Simple options for Twitter
    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'quiet': False,
        'progress': True,
        'no_warnings': False,
        'ignoreerrors': True,
    }
    
    # For Twitter, try to get mp4 directly to avoid ffmpeg issues
    if "twitter.com" in url or "x.com" in url:
        ydl_opts['format'] = 'best[ext=mp4]/best'
    
    print(f"\n📥 Starting simple download...")
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        print("\n✅ Download completed!")
        return True
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def interactive_download(url):
    """Interactive video downloader with quality selection"""
    print(f"\n🔍 Analyzing video: {url}")
    print("=" * 60)
    
    # Get video information
    info = get_video_info(url)
    
    # Check ffmpeg
    ffmpeg_available = check_ffmpeg()
    if not ffmpeg_available and platform.system() == "Windows":
        if not install_ffmpeg_windows():
            print("⚠️  Using simple download mode (no ffmpeg)")
            return simple_download(url)
    
    if not info:
        print("❌ Could not retrieve video information")
        print("   Trying simple download...")
        return simple_download(url)
    
    # Display video information
    title = info.get('title', 'Unknown')
    if len(title) > 60:
        title = title[:57] + "..."
    
    print(f"📹 Title: {title}")
    print(f"👤 Uploader: {info.get('uploader', 'Unknown')}")
    print(f"⏱️ Duration: {info.get('duration_string', 'Unknown')}")
    
    if info.get('view_count'):
        print(f"📊 Views: {info.get('view_count'):,}")
    
    # Get available formats
    formats = list_available_formats(info)
    
    if not formats:
        print("\n⚠️ No format information available.")
        print("   Downloading with simple mode...")
        return simple_download(url)
    
    # Filter formats based on ffmpeg availability
    if not ffmpeg_available:
        # Prefer formats that don't require merging
        usable_formats = [f for f in formats if not f['requires_ffmpeg'] or f['type'] == 'Video+Audio']
        if not usable_formats:
            print("\n⚠️ No formats available without ffmpeg.")
            print("   Trying simple download...")
            return simple_download(url)
        formats = usable_formats
    
    # Filter out duplicate formats
    unique_formats = []
    seen_ids = set()
    
    for fmt in formats:
        if fmt['id'] not in seen_ids:
            seen_ids.add(fmt['id'])
            unique_formats.append(fmt)
    
    formats = unique_formats
    
    print(f"\n📊 Available formats ({len(formats)}):")
    print("=" * 60)
    
    # Display all formats
    for i, fmt in enumerate(formats, 1):
        size_str = format_size(fmt['size'])
        resolution = fmt['resolution'] if fmt['resolution'] != 'N/A' else 'Audio'
        
        # Truncate long format notes
        note = fmt['note']
        if note and len(note) > 15:
            note = note[:12] + '...'
        
        line = f"  [{i:2}] {resolution:12} | {fmt['ext']:5} | {fmt['type']:12} | {size_str:10}"
        
        if note:
            line += f" | {note:15}"
        
        if fmt['requires_ffmpeg']:
            line += " | ⚠️ Needs ffmpeg"
        
        print(line)
    
    print("\n" + "=" * 60)
    print("Options:")
    print("  • Enter format number (e.g., 1, 2, 3)")
    print("  • Press ENTER for best available format")
    print("  • Enter 's' for simple download (no format selection)")
    print("  • Enter 'q' to quit")
    
    if not ffmpeg_available:
        print("  ⚠️  FFmpeg not installed - some formats may not work")
    
    choice = input("\nSelect option: ").strip()
    
    if choice.lower() == 'q':
        print("Download cancelled.")
        return False
    elif choice.lower() == 's':
        return simple_download(url)
    elif choice == '':
        # Default: try to find best format that doesn't require ffmpeg
        if not ffmpeg_available:
            # Look for a Video+Audio format first
            video_audio_formats = [f for f in formats if f['type'] == 'Video+Audio']
            if video_audio_formats:
                selected = video_audio_formats[0]
                return download_video_ytdlp(url, quality=selected['id'])
            else:
                print("Downloading best available format...")
                return download_video_ytdlp(url)
        else:
            print("Downloading best quality...")
            return download_video_ytdlp(url)
    else:
        # Check if choice is a number
        try:
            idx = int(choice)
            if 1 <= idx <= len(formats):
                selected_format = formats[idx - 1]
                format_id = selected_format['id']
                
                # Warn if format requires ffmpeg but not available
                if selected_format['requires_ffmpeg'] and not ffmpeg_available:
                    print(f"⚠️  Warning: This format requires ffmpeg which is not installed.")
                    print(f"   The download may fail or be incomplete.")
                    confirm = input("Continue anyway? (y/n): ").strip().lower()
                    if confirm != 'y':
                        return False
                
                return download_video_ytdlp(url, quality=format_id)
            else:
                print(f"❌ Invalid number. Please enter 1-{len(formats)}")
                return interactive_download(url)
        except ValueError:
            # Not a number, treat as format ID
            return download_video_ytdlp(url, quality=choice)


def main():
    """Main function"""
    print("🎬 Universal Video Downloader")
    print("=" * 50)
    print("Powered by yt-dlp")
    print("Supports: YouTube, Twitter/X, Instagram, TikTok, etc.")
    print("=" * 50)
    
    # Check if yt-dlp is available
    if not check_and_install_yt_dlp():
        print("❌ Cannot proceed without yt-dlp. Please install it manually:")
        print("   pip install yt-dlp")
        return
    
    # Check command line arguments
    if len(sys.argv) < 2:
        print("\nUsage:")
        print("  python final.py <URL>                    - Download video")
        print("  python final.py --simple <URL>          - Simple download (no format selection)")
        print("  python final.py --ffmpeg                - Show ffmpeg installation help")
        print("\nExamples:")
        print("  python final.py https://x.com/user/status/1234567890")
        print("  python final.py --simple https://x.com/user/status/1234567890")
        
        # Interactive mode
        print("\nEnter a URL (or press Enter to exit):")
        url = input("> ").strip()
        if url:
            # Fix x.com to twitter.com
            if "x.com" in url:
                url = url.replace("x.com", "twitter.com")
            interactive_download(url)
        return
    
    # Handle command line arguments
    arg = sys.argv[1]
    
    if arg == '--simple':
        if len(sys.argv) >= 3:
            url = sys.argv[2]
            if "x.com" in url:
                url = url.replace("x.com", "twitter.com")
            simple_download(url)
        else:
            print("❌ Please specify a URL: python final.py --simple <URL>")
    
    elif arg == '--ffmpeg':
        install_ffmpeg_windows()
    
    else:
        # Single URL download
        url = arg
        
        # Fix x.com to twitter.com for better compatibility
        if "x.com" in url:
            url = url.replace("x.com", "twitter.com")
        
        print(f"📝 Processing URL: {url}")
        interactive_download(url)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Program interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")