import { app, BrowserWindow, ipcMain, shell, dialog, desktopCapturer, screen, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'

// Prevent Chromium from throttling video/canvas rendering when main window is hidden
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const DEFAULT_PORT = 8000

let win: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let backendPort = DEFAULT_PORT

/** What the renderer is told about the backend, so the UI can say something true. */
type BackendStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'failed'; reason: string }

let backendStatus: BackendStatus = { state: 'starting' }

export interface LogLine {
  at: number
  source: 'app' | 'backend'
  level: 'info' | 'error'
  text: string
}

/**
 * Recent log lines, kept in memory so the UI can show why startup failed.
 * Backend output previously went only to a console nobody sees.
 */
const logBuffer: LogLine[] = []
const LOG_LIMIT = 500
/** Mirrored to disk so a crash that closes the window is still diagnosable. */
let logFilePath = ''

function record(source: LogLine['source'], level: LogLine['level'], text: string) {
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trimEnd()
    if (!trimmed) continue

    const entry: LogLine = { at: Date.now(), source, level, text: trimmed }
    logBuffer.push(entry)
    if (logBuffer.length > LOG_LIMIT) logBuffer.shift()

    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send('backend-log', entry)
      } catch {
        // window is destroyed or closing
      }
    }
    if (logFilePath) {
      try {
        fs.appendFileSync(logFilePath, `${new Date(entry.at).toISOString()} [${source}] ${trimmed}\n`)
      } catch {
        // logging must never take the app down
      }
    }
  }
}

function log(msg: string) {
  console.log(`[main] ${msg}`)
  record('app', 'info', msg)
}

function setBackendStatus(status: BackendStatus) {
  backendStatus = status
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('backend-status', status)
    } catch {
      // window is destroyed or closing
    }
  }
}

/**
 * Locate the Python that has our dependencies installed.
 *
 * The venv is checked first: a bare `python` from PATH on Windows is usually the
 * Microsoft Store alias, which has none of the backend's packages and opens the
 * Store instead of running.
 */
function resolvePython(): { executable: string; args: string[] } | null {
  const root = process.env.APP_ROOT!
  const venv = process.platform === 'win32'
    ? path.join(root, 'python_backend', '.venv', 'Scripts', 'python.exe')
    : path.join(root, 'python_backend', '.venv', 'bin', 'python')

  const server = path.join(root, 'python_backend', 'app', 'api', 'server.py')

  if (fs.existsSync(venv)) {
    return { executable: venv, args: [server] }
  }

  log(`No venv at ${venv} — falling back to a system Python. Run: python -m venv python_backend/.venv`)
  const fallbacks: Array<{ executable: string; args: string[] }> = process.platform === 'win32'
    ? [{ executable: 'py', args: ['-3', server] }, { executable: 'python', args: [server] }]
    : [{ executable: 'python3', args: [server] }, { executable: 'python', args: [server] }]

  return fallbacks[0] ?? null
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, '127.0.0.1')
  })
}

/** First free port at or after `start`, so we never fight another app for 8000. */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    if (await isPortFree(port)) return port
  }
  return start
}

/**
 * One health probe.
 *
 * Uses node:http rather than fetch: fetch in the main process goes through
 * Chromium's network stack, which could hang on a localhost request without
 * ever resolving or honouring the abort signal — leaving the UI stuck on
 * "Starting the backend" even though the backend was up and answering.
 */
function probe(port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/', timeout: timeoutMs },
      (res) => {
        const ok = (res.statusCode ?? 500) < 400
        res.resume() // drain so the socket can close
        resolve(ok)
      },
    )
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

async function waitForBackend(port: number, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // exitCode is null while running; a number means it already died.
    if (typeof pythonProcess?.exitCode === 'number') return false
    if (await probe(port)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

async function startPythonBackend() {
  const resolved = resolvePython()
  if (!resolved) {
    setBackendStatus({ state: 'failed', reason: 'No Python interpreter found.' })
    return
  }

  const isPackaged = app.isPackaged
  const executable = isPackaged ? path.join(process.resourcesPath, 'backend.exe') : resolved.executable
  const args = isPackaged ? [] : resolved.args

  if (isPackaged && !fs.existsSync(executable)) {
    setBackendStatus({ state: 'failed', reason: 'Backend executable is missing from this install.' })
    return
  }

  backendPort = await findFreePort(DEFAULT_PORT)
  log(`Starting backend: ${executable} (port ${backendPort})`)
  setBackendStatus({ state: 'starting' })

  let stderrTail = ''

  pythonProcess = spawn(executable, args, {
    env: { ...process.env, BENCH_PORT: String(backendPort), PYTHONUNBUFFERED: '1' },
    // The frozen backend is a console app; without this its window flashes up.
    windowsHide: true,
  })

  // Without this listener a missing executable is an unhandled exception in main.
  pythonProcess.on('error', (err) => {
    log(`Failed to spawn backend: ${err.message}`)
    setBackendStatus({ state: 'failed', reason: `Could not start Python: ${err.message}` })
  })

  pythonProcess.stdout?.on('data', (d) => record('backend', 'info', String(d)))
  pythonProcess.stderr?.on('data', (d) => {
    const text = String(d)
    stderrTail = (stderrTail + text).slice(-2000)
    // uvicorn writes its normal startup banner to stderr, so only genuine
    // problems are marked as errors.
    const level = /error|traceback|exception|failed/i.test(text) ? 'error' : 'info'
    record('backend', level, text)
  })

  pythonProcess.on('close', (code) => {
    log(`Backend exited with code ${code}`)
    if (code !== 0 && backendStatus.state !== 'ready') {
      // ModuleNotFoundError is by far the most common cause, so name the fix.
      const missing = /ModuleNotFoundError: No module named '([^']+)'/.exec(stderrTail)
      setBackendStatus({
        state: 'failed',
        reason: missing
          ? `Python package "${missing[1]}" is missing. Run: python_backend/.venv/Scripts/pip install -r python_backend/requirements.txt`
          : `Backend stopped unexpectedly (exit ${code}).`,
      })
    }
  })

  const ready = await waitForBackend(backendPort)
  if (ready) {
    log(`Backend ready on ${backendPort}`)
    setBackendStatus({ state: 'ready', port: backendPort })
  } else if (backendStatus.state !== 'failed') {
    setBackendStatus({ state: 'failed', reason: 'Backend did not respond in time.' })
  }
}

/**
 * Stop only the process we started. The previous version force-killed whatever
 * happened to hold port 8000, which could be an unrelated app.
 */
function stopPythonBackend() {
  if (!pythonProcess?.pid) return
  log(`Stopping backend (pid ${pythonProcess.pid})`)
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(pythonProcess.pid)], { stdio: 'ignore' })
    } else {
      pythonProcess.kill('SIGTERM')
    }
  } catch (e) {
    log(`Error stopping backend: ${e}`)
  }
  pythonProcess = null
}

function createOverlayWindow(): BrowserWindow {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin

  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: screenX, y: screenY } = primaryDisplay.workArea

  const width = 380
  const height = 68
  const x = Math.round(screenX + 24)
  const y = Math.round(screenY + 24)

  overlayWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  overlayWin.setContentProtection(true)
  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setVisibleOnAllWorkspaces?.(true)

  const overlayUrl = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#/record-overlay`
    : `file://${path.join(RENDERER_DIST, 'index.html')}#/record-overlay`

  overlayWin.loadURL(overlayUrl)

  overlayWin.on('closed', () => {
    overlayWin = null
  })

  return overlayWin
}

async function captureAllPreviews(w: BrowserWindow) {
  const routes = [
    { name: 'download', hash: '#/download' },
    { name: 'clip', hash: '#/clip' },
    { name: 'segment', hash: '#/segment' },
    { name: 'inspect', hash: '#/inspect' },
    { name: 'gif', hash: '#/gif' },
    { name: 'edit', hash: '#/edit' },
    { name: 'record', hash: '#/record' },
  ]
  const previewDir = path.join(process.env.APP_ROOT, 'preview')
  if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true })

  await new Promise((r) => setTimeout(r, 3000))

  for (const r of routes) {
    await w.webContents.executeJavaScript(`window.location.hash = '${r.hash}'`)
    await new Promise((res) => setTimeout(res, 1500))
    const img = await w.webContents.capturePage()
    fs.writeFileSync(path.join(previewDir, `${r.name}.png`), img.toPNG())
    console.log(`[Preview Captured] ${r.name}.png`)
  }

  // Also capture Studio Modal
  await w.webContents.executeJavaScript(`window.location.hash = '#/record'`)
  await new Promise((res) => setTimeout(res, 1000))
  await w.webContents.executeJavaScript(`
    const btns = Array.from(document.querySelectorAll('button'));
    const studioBtn = btns.find(b => b.textContent && b.textContent.includes('Configure & Preview Studio'));
    if (studioBtn) studioBtn.click();
  `)
  await new Promise((res) => setTimeout(res, 1500))
  const studioImg = await w.webContents.capturePage()
  fs.writeFileSync(path.join(previewDir, 'zoom_studio.png'), studioImg.toPNG())
  console.log('[Preview Captured] zoom_studio.png')

  console.log('ALL PREVIEWS CAPTURED SUCCESSFULLY!')
  setTimeout(() => app.quit(), 1000)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1C1F26',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => {
    win?.show()
    if (process.env.CAPTURE_PREVIEWS === 'true') {
      captureAllPreviews(win!)
    }
  })

  win.webContents.on('did-finish-load', () => {
    // Replay status for a renderer that loaded after the backend settled.
    win?.webContents.send('backend-status', backendStatus)
  })

  // Open external links in the real browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', stopPythonBackend)
app.on('will-quit', stopPythonBackend)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  // Start a fresh log each run, next to the app's other user data.
  try {
    logFilePath = path.join(app.getPath('userData'), 'bench.log')
    fs.writeFileSync(logFilePath, `Bench ${app.getVersion()} — ${new Date().toISOString()}\n`)
  } catch {
    logFilePath = ''
  }

  // Handle display media requests gracefully
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0] })
    })
  })

  ipcMain.on('minimize', () => win?.minimize())
  ipcMain.on('close', () => win?.close())
  ipcMain.on('maximize-toggle', () => {
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('get-backend-status', () => backendStatus)
  ipcMain.handle('get-logs', () => logBuffer)
  ipcMain.handle('open-log-file', () => {
    if (logFilePath) shell.showItemInFolder(logFilePath)
    return logFilePath
  })
  ipcMain.handle('restart-backend', async () => {
    log('Restarting backend on request')
    stopPythonBackend()
    await startPythonBackend()
    return backendStatus
  })

  ipcMain.handle('open-downloads', () => shell.openPath(app.getPath('downloads')))

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose where downloads are saved',
      buttonLabel: 'Save here',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Choose a video file',
      filters: [
        { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('open-file-location', async (_, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath)
      return true
    }
    return false
  })

  // Screen recording & overlay IPC handlers
  ipcMain.handle('get-screen-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 160, height: 90 },
      fetchWindowIcons: false,
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      display_id: s.display_id,
    }))
  })

  ipcMain.handle('save-temp-recording', async (_, arrayBuffer: ArrayBuffer) => {
    const tempDir = app.getPath('temp')
    const filePath = path.join(tempDir, `screen_record_${Date.now()}.webm`)
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer))
    return filePath
  })

  ipcMain.handle('show-record-overlay', () => {
    const oWin = createOverlayWindow()
    oWin.show()
    win?.hide()
    return true
  })

  ipcMain.handle('hide-record-overlay', () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.hide()
      overlayWin.close()
      overlayWin = null
    }
    return true
  })

  ipcMain.handle('restore-main-window', () => {
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
    return true
  })

  ipcMain.on('record-action', (event, action) => {
    if (win && !win.isDestroyed() && event.sender !== win.webContents) {
      win.webContents.send('record-action', action)
    }
    if (overlayWin && !overlayWin.isDestroyed() && event.sender !== overlayWin.webContents) {
      overlayWin.webContents.send('record-action', action)
    }
  })

  createWindow()
  void startPythonBackend()
})
