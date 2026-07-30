# Bench

A desktop workbench for pulling video off the web and working with it locally.
Electron and React on the front, a Python/FastAPI sidecar wrapping yt-dlp,
ffmpeg and OpenCV on the back. Everything runs on your machine.

## The window

```
┌────────────────────────────────────────────────────────────┐
│ Bench │ ● Backend ready                        ─  □  ✕    │  Title bar
├───────────────┬────────────────────────────────────────────┤
│  Download     │  Download                                  │
│  Clip         │  Save a video, or pull just its audio…     │
│  Segment      │  ┌──────────────────────────────────────┐  │
│  Inspect      │  │ Paste a video URL     [Fetch formats]│  │  Tool view
│  GIF          │  └──────────────────────────────────────┘  │
│               │  ┌──────────────────────────────────────┐  │
│               │  │ FORMAT      BAR LENGTH = FILE SIZE   │  │  Format ladder
│               │  │ 4K    vp9  ████████████     1.3 GB   │  │
│               │  │ 1080p h264 █████             246 MB  │  │
│               │  │              Selected 1080p [Download]│ │
│               │  └──────────────────────────────────────┘  │
│               │  ┌──────────────────────────────────────┐  │
│  ───────────  │  │ SAVED                     Complete   │  │  Result panel
│  TRANSFERS    │  │ C:\Users\…\clip.mp4      [Show file] │  │
│  ▸ clip.mp4   │  └──────────────────────────────────────┘  │
│    62% · 2MB/s│  ┌──────────────────────────────────────┐  │
│               │  │ ▾ ACTIVITY 12 · 1 error   [Clear]…   │  │  Activity log
│  Open Downloads  │ 22:16:06 backend  Uvicorn running…   │  │
└───────────────┴────────────────────────────────────────────┘
```

### 1. Title bar

App name, a status dot, and the window controls. The dot is the real state of
the Python backend, not decoration:

| Dot | Meaning |
|---|---|
| Amber — *Starting backend* | Unpacking and launching. First run can take up to a minute. |
| Green — *Backend ready* | Answering on its port. Tools are usable. |
| Red — *Backend not running* | It failed. Hover for the reason; the Activity log has the detail. |

### 2. Left rail

The five tools, plus the transfers list and a shortcut to your Downloads folder.

| Menu item | What it does |
|---|---|
| **Download** | Fetches every format a link offers and shows them as a ladder. Pick a resolution, or take the audio alone as MP3. |
| **Clip** | YouTube renders clips at reduced quality. Give Bench a `/clip/` link and it finds the source video and downloads that range at full resolution. |
| **Segment** | Cuts a range out of a long video by timecode, without downloading the whole thing. |
| **Inspect** | Measures a local file: real resolution, codec, bitrate, and an OpenCV sharpness score that exposes footage upscaled to fake 4K. |
| **GIF** | Converts a video file to a GIF at a chosen frame rate and width, with optional trimming. |

**Transfers** sits below them and lists every download this session, across all
tools. Downloads keep running while you switch tools — the list is the one place
that shows all of them. Each row goes `downloading → merging → saved`, and a
finished row reveals the file in Explorer. *Clear* removes the finished ones.

### 3. Tool view

The main area. Every tool has the same frame: a title, one line saying what it
does, its own controls, then its Activity log.

If the backend is not ready, the controls are replaced by a panel explaining why
— so you never get buttons that silently do nothing.

### 4. Panels

| Panel | Appears in | Contents |
|---|---|---|
| **Format ladder** | Download | One rung per resolution. Bar length is file size on a square-root scale, so 4K still reads as much larger while 144p stays visible. Codec is shown per rung; audio is separated below a rule. The footer holds the selection and the Download button. |
| **Range** | Segment, GIF | Start and end timecode, `hh:mm:ss` or plain seconds. Shows the resulting length and rejects an end before the start. |
| **GIF options** | GIF | Frame rate (10 / 15 / 20 / 25 fps) and width (320 / 480 / 640 / 800 px). Height follows the source. |
| **Report** | Inspect | A verdict — *Native resolution* or *Likely upscaled* — then resolution, class, codec, frame rate, bitrate and sharpness. |
| **Saved / Downloading** | all download tools | Live progress with speed and ETA, then the final path with *Show file*. Merging shows motion rather than a fake percentage, because there is no percentage to report at that stage. |
| **GIF result** | after any download | Offers to turn the finished file into a GIF, then shows conversion progress and the output path. |
| **Activity** | every tool | See below. |

### 5. Activity log

Each tool keeps **its own log** — the GIF log does not fill with download
chatter. Lines are tagged by source:

- `download` / `clip` / `segment` / `inspect` / `gif` — that tool's own events
- `backend` — output from the Python process
- `system` — app and backend lifecycle

Backend and system lines appear under every tool, deliberately: a backend
failure is usually why a tool failed. Errors are red and counted in the header.

It is collapsed while things work and opens automatically when the backend is
not ready. *Clear* empties the current tool's log, *Restart backend* relaunches
the Python process, and *File* reveals `bench.log`, which mirrors everything to
disk so a crash that closes the window is still diagnosable.

Downloads land in your Downloads folder.

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

## Media behaviour worth knowing

- **Audio is always AAC when the output is MP4.** `bestaudio` usually resolves
  to Opus because it is the higher bitrate, but Opus inside an MP4 is not
  decodable by most Windows players and the file plays silent. AAC is picked
  instead wherever the result is muxed to MP4.
- **Ranges are cut on keyframes.** Without this ffmpeg copies from the nearest
  *preceding* keyframe and marks the earlier frames "discard" with negative
  timestamps, so the clip opens on several seconds of frozen video while the
  audio runs ahead. Cutting on keyframes re-encodes around the cut points, which
  costs a little time and makes the clip start clean and stay in sync.
- **Segment and Clip run signed out.** A range download is handed to ffmpeg, and
  yt-dlp does not give it the cookie jar, so a URL resolved against a signed-in
  session comes back `403`. Public videos work; private and age-restricted ones
  do not, through those two tools.
- **A stale cookie jar is survivable.** Expired cookies fail every request with
  "The page needs to be reloaded". Bench detects that, retries signed out, and
  says so in the log. Re-export `cookies.txt` to restore signed-in access.

## Notes

- **yt-dlp is pinned** in `python_backend/requirements.txt`. It tracks site
  changes constantly, so when a site stops working, bump it first:
  `python_backend/.venv/Scripts/pip install -U yt-dlp`.
- **The UI follows a written design system**, `.claude/skills/bench-ui/SKILL.md`
  — type scale, spacing steps, neutral ramp and button specs. Read it before
  adding a screen so new work matches the existing views.
- **TypeScript is held at 6.0.3.** typescript-eslint refuses to run against
  TypeScript 7, so the linter and the compiler can't both be on latest yet.
  Revisit when typescript-eslint ships TS 7 support.
- Node is used by yt-dlp for YouTube signature solving and is found on your
  PATH. Set `BENCH_NODE_PATH` to point at a specific binary if needed.
- `BENCH_REMOTE_COMPONENTS=1` lets yt-dlp fetch JS helpers from GitHub at
  download time. Off by default: it needs network access and is a supply-chain
  surface.

## Packaging

Use `build.bat` — it does the whole thing, in order, and cleans up first.

```
build.bat            full build to the last folder used (default "D:\linkdownload testing")
build.bat "C:\out"   build there, and remember it for next time
build.bat --fast     skip the PyInstaller step and reuse the last backend.exe
```

It freezes `backend.exe` with PyInstaller, type-checks and builds the renderer,
then packages the installer. Before packaging it deletes the previous
installer, `win-unpacked`, and any Bench installed **inside** the output folder,
so there is never a stale copy left to launch by mistake. Installs elsewhere are
untouched.

`--fast` cuts a rebuild to about a minute; use it when only the UI changed, as
the backend takes several minutes to freeze and rarely changes.

`build.bat` must keep **CRLF line endings** — `cmd.exe` mis-parses parenthesised
blocks in an LF-only batch file, which makes it execute fragments of its own
comments. `.gitattributes` pins this.

`npm run package` still works for a bare electron-builder run, but it assumes
`python_backend/dist/backend.exe` already exists.

## License

MIT
