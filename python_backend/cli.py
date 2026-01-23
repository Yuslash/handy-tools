import sys
from app.core.utils import check_and_install_yt_dlp, install_ffmpeg_windows
from app.core.downloader import interactive_download, simple_download

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
        print("  python cli.py <URL>                    - Download video")
        print("  python cli.py --simple <URL>          - Simple download (no format selection)")
        print("  python cli.py --ffmpeg                - Show ffmpeg installation help")
        print("\nExamples:")
        print("  python cli.py https://x.com/user/status/1234567890")
        print("  python cli.py --simple https://x.com/user/status/1234567890")
        
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
            print("❌ Please specify a URL: python cli.py --simple <URL>")
    
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
