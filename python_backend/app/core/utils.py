import sys
import os
import subprocess
import platform

# Global state for yt-dlp availability
YT_DLP_AVAILABLE = False
yt_dlp = None

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
    
    # Try importing if checking for the first time
    if yt_dlp is None:
        try:
            import yt_dlp as ydl_lib
            yt_dlp = ydl_lib
            YT_DLP_AVAILABLE = True
        except ImportError:
            YT_DLP_AVAILABLE = False

    if YT_DLP_AVAILABLE:
        try:
            print(f"✅ yt-dlp {yt_dlp.version.__version__} available")
            return True
        except:
            pass
    
    print("❌ yt-dlp not found. Installing...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp", "--upgrade", "--quiet"])
        print("✅ yt-dlp installed successfully")
        
        # Try importing again
        try:
            import yt_dlp as ydl_lib
            yt_dlp = ydl_lib
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

def format_size(size_bytes):
    """Format file size in human readable format"""
    if not size_bytes or size_bytes == 0:
        return "Unknown"
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def parse_time_to_seconds(time_str):
    """
    Converts a time string in format 'HH:MM:SS', 'MM:SS', or 'SS' to total seconds.
    """
    if not time_str:
        return None
        
    try:
        # If it's already a number (string or float), return it
        try:
            val = float(time_str)
            return val
        except ValueError:
            pass
            
        parts = list(map(float, time_str.strip().split(':')))
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        elif len(parts) == 1:
            return parts[0]
        else:
            return None
    except Exception as e:
        print(f"Error parsing time '{time_str}': {e}")
        return None
