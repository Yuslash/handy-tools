import os
import platform
import shutil
from pathlib import Path

# Try to import yt_dlp, but don't fail immediately if not found
# The check_and_install_yt_dlp function should be called before using this module's functions
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

from .utils import check_ffmpeg, format_size, install_ffmpeg_windows, check_and_install_yt_dlp
from .logger import MyLogger


def find_node():
    """Locate a Node binary, preferring an explicit override.

    yt-dlp only enables deno automatically, so Node has to be passed in by path
    or YouTube extraction runs with no JS runtime and silently loses formats.
    Searching PATH keeps this working with nvm/fnm/volta, which the previous
    hardcoded 'C:/Program Files/nodejs/node.exe' did not.
    """
    override = os.environ.get('BENCH_NODE_PATH')
    if override and os.path.exists(override):
        return override

    found = shutil.which('node')
    if found:
        return found

    for candidate in (
        r'C:\Program Files\nodejs\node.exe',
        r'C:\Program Files (x86)\nodejs\node.exe',
        '/usr/local/bin/node',
        '/usr/bin/node',
    ):
        if os.path.exists(candidate):
            return candidate
    return None


def apply_js_runtime(ydl_opts):
    """Give yt-dlp a JS runtime for YouTube signature solving, if one exists."""
    node = find_node()
    if node:
        ydl_opts['js_runtimes'] = {'node': {'args': [node]}}
    else:
        print("[JS] No Node runtime found — some YouTube formats may be missing")

    # Opt-in: this fetches executable JS from GitHub at download time.
    if os.environ.get('BENCH_REMOTE_COMPONENTS') == '1':
        ydl_opts['remote_components'] = ['ejs:github']

    return ydl_opts

def get_video_info(url):
    """Get video information using yt-dlp Python API"""
    global yt_dlp
    if yt_dlp is None:
        # One last check in case it was installed dynamically
        try:
            import yt_dlp as ydl_lib
            yt_dlp = ydl_lib
        except ImportError:
            return None
    
    # Check for cookies.txt
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(os.path.dirname(current_dir)) # app/core -> app -> python_backend
    project_root = os.path.dirname(parent_dir)
    
    cookie_file = os.path.join(parent_dir, 'cookies.txt')
    if not os.path.exists(cookie_file):
         cookie_file = os.path.join(project_root, 'cookies.txt')
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'noplaylist': True,
        # No 'ignoreerrors' — the caller needs the real reason a URL failed so it
        # can show it, rather than a bare None that becomes "Could not retrieve
        # video info".
    }

    if os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
    else:
        ydl_opts['cookiesfrombrowser'] = ('chrome', )

    apply_js_runtime(ydl_opts)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


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


def download_video_ytdlp(url, quality=None, output_dir=None):
    """Download video using yt-dlp Python API"""
    global yt_dlp
    if yt_dlp is None:
        try:
             import yt_dlp as ydl_lib
             yt_dlp = ydl_lib
        except ImportError:
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
    # Check for cookies.txt
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(os.path.dirname(current_dir))
    project_root = os.path.dirname(parent_dir)
    
    cookie_file = os.path.join(parent_dir, 'cookies.txt')
    if not os.path.exists(cookie_file):
         cookie_file = os.path.join(project_root, 'cookies.txt')

    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'logger': MyLogger(),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': False,
        'ignoreerrors': True,
    }
    
    if os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
        print(f"[Cookies] Using file: {cookie_file}")
    else:
        ydl_opts['cookiesfrombrowser'] = ('chrome', )
        print("[Cookies] Using Chrome browser cookies")
        
    # Explicitly enable Node.js
    apply_js_runtime(ydl_opts)
    
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
    global yt_dlp
    if yt_dlp is None:
        try:
             import yt_dlp as ydl_lib
             yt_dlp = ydl_lib
        except ImportError:
            print("❌ yt-dlp is not available")
            return False
    
    if output_dir is None:
        output_dir = os.path.join(Path.home(), "Downloads")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Simple options for Twitter
    # Check for cookies.txt
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(os.path.dirname(current_dir))
    project_root = os.path.dirname(parent_dir)
    
    cookie_file = os.path.join(parent_dir, 'cookies.txt')
    if not os.path.exists(cookie_file):
         cookie_file = os.path.join(project_root, 'cookies.txt')

    ydl_opts = {
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'quiet': False,
        'progress': True,
        'no_warnings': False,
        'ignoreerrors': True,
    }
    
    if os.path.exists(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
    else:
        ydl_opts['cookiesfrombrowser'] = ('chrome', )
    
    # Explicitly enable Node.js
    apply_js_runtime(ydl_opts)
    
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
