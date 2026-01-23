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
