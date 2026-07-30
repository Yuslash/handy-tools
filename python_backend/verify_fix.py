import sys
import os

# Add the current directory to sys.path so we can import app modules
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.core import downloader

# URL that was failing
url = "https://youtu.be/xsbLtHql4g8" 

print(f"Testing download for: {url}")
try:
    # Use a specific output directory for testing
    output_dir = os.path.join(current_dir, "test_downloads")
    
    # Try the simple download which uses the updated configuration
    result = downloader.simple_download(url, output_dir=output_dir)
    
    if result:
        print("\nSUCCESS: Download completed successfully.")
    else:
        print("\nFAILURE: Download failed.")
        sys.exit(1)

except Exception as e:
    print(f"\nEXCEPTION: {e}")
    sys.exit(1)
