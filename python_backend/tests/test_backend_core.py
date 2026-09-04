"""
Automated unit test suite for the Bench Python backend.
Runs in CI/CD before build packaging to ensure backend functionality.
"""
import sys
import os
import unittest
import asyncio
import queue

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.utils import parse_time_to_seconds, check_ffmpeg
from app.api.server import app, read_root, tidy_error


class TestUtils(unittest.TestCase):
    def test_parse_time_seconds_simple(self):
        self.assertEqual(parse_time_to_seconds("45"), 45.0)
        self.assertEqual(parse_time_to_seconds("45.5"), 45.5)

    def test_parse_time_minutes_seconds(self):
        self.assertEqual(parse_time_to_seconds("01:30"), 90.0)
        self.assertEqual(parse_time_to_seconds("10:00.5"), 600.5)

    def test_parse_time_hours_minutes_seconds(self):
        self.assertEqual(parse_time_to_seconds("01:00:00"), 3600.0)
        self.assertEqual(parse_time_to_seconds("01:02:03.5"), 3723.5)

    def test_parse_time_invalid(self):
        self.assertIsNone(parse_time_to_seconds(""))
        self.assertIsNone(parse_time_to_seconds("not-a-time"))
        self.assertIsNone(parse_time_to_seconds("1:2:3:4"))

    def test_tidy_error(self):
        raw_error = "\x1b[0;31mERROR:\x1b[0m Video unavailable"
        self.assertEqual(tidy_error(raw_error), "Video unavailable")

        plain_error = "ERROR: Private video"
        self.assertEqual(tidy_error(plain_error), "Private video")

        empty_error = ""
        self.assertEqual(tidy_error(empty_error), "Something went wrong.")


class TestServerRoutes(unittest.TestCase):
    def test_routes_registered(self):
        registered_paths = {route.path for route in app.routes if hasattr(route, "path")}
        self.assertIn("/", registered_paths)
        self.assertIn("/api/info", registered_paths)
        self.assertIn("/api/ws", registered_paths)

    def test_read_root(self):
        res = asyncio.run(read_root())
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["service"], "Bench backend")
        self.assertIn("ffmpeg", res)


class TestProgressParser(unittest.TestCase):
    def test_ffmpeg_progress_parsing(self):
        q = queue.Queue()
        last_percent = -1
        total_duration = 60.0

        sample_lines = [
            "frame=    1 fps=1.0 q=-1.0 size=     256KiB time=00:00:15.00 bitrate=N/A speed=N/A",
            "frame=   30 fps=30.0 q=-1.0 size=    1024KiB time=00:00:30.00 bitrate=N/A speed=1x",
            "frame=   60 fps=30.0 q=-1.0 size=    2048KiB time=00:01:00.00 bitrate=N/A speed=1x",
        ]

        import re
        for line in sample_lines:
            match = re.search(r'time=\s*(\d+:\d+:\d+\.\d+|\d+\.\d+)', line)
            if match:
                current_time = parse_time_to_seconds(match.group(1))
                if current_time is not None and total_duration > 0:
                    percent = (current_time / total_duration) * 100
                    percent = max(0, min(99.9, percent))
                    if percent > last_percent + 0.5:
                        last_percent = percent
                        q.put(f"{percent:.1f}%")

        results = []
        while not q.empty():
            results.append(q.get())

        self.assertIn("25.0%", results)
        self.assertIn("50.0%", results)
        self.assertIn("99.9%", results)


if __name__ == "__main__":
    unittest.main()
