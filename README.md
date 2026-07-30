# Bench

A desktop workbench for pulling video off the web and working with it locally.
Electron and React on the front, a Python/FastAPI sidecar wrapping yt-dlp,
ffmpeg and OpenCV on the back. Everything runs on your machine.

## Tools

| Tool | What it does |
|---|---|
| **Download** | Fetches every format a link offers and shows them as a ladder, where bar length is file size. Pick a resolution, or take the audio alone as MP3. |
| **Clip** | YouTube renders clips at reduced quality. Give Bench a `/clip/` link and it finds the source video and downloads that range at full resolution. |
| **Segment** | Cuts a range out of a long video by timecode, without downloading the whole thing. |
| **Inspect** | Measures a local file: real resolution, codec, bitrate, and an OpenCV sharpness score that exposes footage upscaled to fake 4K. |
| **GIF** | Converts a video file to a GIF at a chosen frame rate and width, with optional trimming. |

Downloads land in your Downloads folder. Anything finished can be revealed in
Explorer from the transfers list, which keeps running while you switch tools.

## Setup

Requires **Node 20+**, **Python 3.10+**, and **ffmpeg on your PATH**.

```bash
npm install
npm run setup:backend   # creates python_backend/.venv and installs pinned deps
npm run dev
```

`setup:backend` is not optional. The backend runs from `python_backend/.venv`,
and without it every feature fails, because all of them talk to the local API.

To check ffmpeg is visible:

```bash
ffmpeg -version
```

Without it, Bench falls back to pre-merged formats — no 4K, no MP3 extraction —
and Inspect won't run at all.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server plus Electron, backend started automatically |
| `npm run build` | Typecheck and build the renderer |
| `npm run package` | Build, then produce an installer via electron-builder |
| `npm run backend` | Run the Python API on its own, for debugging |
| `npm run lint` / `npm run typecheck` | Static checks |

## How it fits together

The Electron main process picks the first free port from 8000, starts the
backend with `BENCH_PORT` set, and polls `GET /` until it answers before
reporting `ready` to the renderer. The titlebar shows that state, so when the
backend is down the UI says so rather than leaving dead buttons.

Downloads stream progress over a WebSocket at `/api/ws`; GIF conversion streams
over SSE at `/api/convert_gif_stream`. Metadata (`/api/info`) and file
inspection (`/api/check_quality`) are plain POSTs.

## Signed-in downloads

Some videos need your session. Export cookies with a browser extension, then:

```bash
python python_backend/save_cookies.py exported.json
```

That writes `cookies.txt` in the project root, where the backend looks for it.
**`cookies.txt` holds live credentials and is gitignored — keep it that way.**

## Notes

- **yt-dlp is pinned** in `python_backend/requirements.txt`. It tracks site
  changes constantly, so when a site stops working, bump it first:
  `python_backend/.venv/Scripts/pip install -U yt-dlp`.
- **TypeScript is held at 6.0.3.** typescript-eslint refuses to run against
  TypeScript 7, so the linter and the compiler can't both be on latest yet.
  Revisit when typescript-eslint ships TS 7 support.
- Node is used by yt-dlp for YouTube signature solving and is found on your
  PATH. Set `BENCH_NODE_PATH` to point at a specific binary if needed.
- `BENCH_REMOTE_COMPONENTS=1` lets yt-dlp fetch JS helpers from GitHub at
  download time. Off by default: it needs network access and is a supply-chain
  surface.

## Packaging

`npm run package` bundles the renderer and Electron. The packaged app expects a
`backend.exe` built from `python_backend` with PyInstaller and shipped via
`extraResources`; build it before packaging, or the installed app will start
with no backend.

## License

MIT
