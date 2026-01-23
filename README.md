# Nexus: Advanced Media Extraction Suite

**Nexus** is a premium, high-performance desktop application for media downloading and analysis. It combines a sleek, futuristic "Control Center" UI with powerful backend tools (`yt-dlp`, `ffmpeg`, `opencv`) to provide pro-level media extraction capabilities.

## Features

### 1. Media Downloader
Extract high-fidelity video and audio streams from thousands of supported platforms (YouTube, Twitch, etc.).
-   **Formats**: Select explicitly between Video+Audio, Video Only, or Audio Only.
-   **Quality**: Supports resolutions from SD up to 8K, with automatic merging of best video/audio streams.
-   **UI**: Real-time progress tracking with speed, ETA, and download percentage.

### 2. 4K Clip Extractor
Download specific segments of a video in maximum quality without re-encoding.
-   **Smart Detection**: Automatically detects YouTube Clip URLs.
-   **Force 4K**: Intelligently switches to the original full-length video source to extract the clip range in true 4K (if available), bypassing the lower-quality pre-cut clips usually served.

### 3. Web Capture
Generate full-page scrolling screenshots of any website.
-   **Engine**: Uses a headless browser to render and capture the entire scrollable area of a webpage.
-   **Output**: High-resolution PNGs saved directly to your downloads.

### 4. Video Quality Inspector
Analyze local video files to verify their *true* quality.
-   **Native Resolution Check**: Detects if a video is "Native 4K" or just upscaled from 1080p.
-   **Bitrate Analysis**: Displays the actual video bitrate.
-   **Sharpness Score**: Uses Computer Vision (OpenCV Laplacian variance) to calculate a sharpness score (0-100+) to objectively measure image clarity.
-   **Upscale Warning**: Flags videos that have high resolution but low sharpness as "Potential FAKE (Upscaled)".

## Technology Stack

-   **Frontend**: React, TypeScript, TailwindCSS, Lucide Icons.
-   **Backend**: Python (FastAPI), Uvicorn.
-   **Core Engines**:
    -   `yt-dlp` (Media extraction)
    -   `ffmpeg` (Media processing)
    -   `opencv-python` (Image analysis)
    -   `playwright` (Web capture)
-   **Desktop Runtime**: Electron.

## Installation & Setup

### Prerequisites
-   Node.js (v18+)
-   Python (v3.10+)
-   Git
-   FFmpeg (must be in system PATH)

### Quick Start
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Yuslash/handy-tools.git
    cd nexus-downloader
    ```

2.  **Install Frontend Dependencies**:
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies**:
    ```bash
    pip install -r python_backend/requirements.txt
    ```

4.  **Run Development Mode**:
    ```bash
    npm run dev
    ```
    This starts both the React frontend (Vite) and the Python backend concurrently.

## Building for Production

To create a standalone Windows executable (`.exe`):

```bash
npm run build
```
This will:
1.  Compile the React frontend.
2.  Package the Python backend using PyInstaller (ensure you have `pyinstaller` installed).
3.  Bundle everything into an Electron executable.

## License
MIT
