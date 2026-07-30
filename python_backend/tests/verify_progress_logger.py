import sys
import os
import queue

# Mock parse_time_to_seconds locally for testing
def parse_time_to_seconds(time_str):
    try:
        parts = list(map(float, time_str.strip().split(':')))
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        elif len(parts) == 1:
            return parts[0]
        else:
            return None
    except:
        return None

# Mock ProgressLogger logic (copied from server.py for unit testing)
class ProgressLogger:
    def __init__(self, progress_queue, total_duration=None):
        self.progress_queue = progress_queue
        self.total_duration = total_duration
        self.last_percent = -1

    def error(self, msg):
        self._parse_progress(msg)

    def _parse_progress(self, msg):
        if not self.total_duration or "time=" not in msg:
            return

        import re
        match = re.search(r'time=\s*(\d+:\d+:\d+\.\d+|\d+\.\d+)', msg)
        if match:
            time_str = match.group(1)
            try:
                current_time = parse_time_to_seconds(time_str)
                if current_time is not None:
                    if self.total_duration > 0:
                        percent = (current_time / self.total_duration) * 100
                        percent = max(0, min(99.9, percent))
                        
                        if percent > self.last_percent + 0.5:
                            self.last_percent = percent
                            self.progress_queue.put(f"{percent:.1f}%")
            except Exception as e:
                print(f"Error: {e}")

def test_logger():
    q = queue.Queue()
    # Assume 1 minute clip
    logger = ProgressLogger(q, total_duration=60.0)
    
    test_lines = [
        "frame=    1 fps=1.0 q=-1.0 size=     256KiB time=00:00:01.00 bitrate=N/A speed=N/A",
        "frame=   30 fps=30.0 q=-1.0 size=    1024KiB time=00:00:30.00 bitrate=N/A speed=1x",
        "frame=   60 fps=30.0 q=-1.0 size=    2048KiB time=00:01:00.00 bitrate=N/A speed=1x",
    ]
    
    print("Running test lines...")
    for line in test_lines:
        logger.error(line)
    
    print("\nResults:")
    while not q.empty():
        print(q.get())

if __name__ == "__main__":
    test_logger()
