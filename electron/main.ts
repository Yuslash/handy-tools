import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const DEFAULT_PORT = 8000

let win: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let backendPort = DEFAULT_PORT

/** What the renderer is told about the backend, so the UI can say something true. */
type BackendStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'failed'; reason: string }

let backendStatus: BackendStatus = { state: 'starting' }

function log(msg: string) {
  console.log(`[main] ${msg}`)
}

function setBackendStatus(status: BackendStatus) {
  backendStatus = status
  win?.webContents.send('backend-status', status)
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

async function waitForBackend(port: number, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pythonProcess?.exitCode !== null && pythonProcess?.exitCode !== undefined) {
      return false // process already died; no point polling
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
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

  pythonProcess.stdout?.on('data', (d) => log(`[backend] ${d}`.trimEnd()))
  pythonProcess.stderr?.on('data', (d) => {
    const text = String(d)
    stderrTail = (stderrTail + text).slice(-2000)
    console.error(`[backend] ${text}`.trimEnd())
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
    },
  })

  win.once('ready-to-show', () => win?.show())

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
  ipcMain.on('minimize', () => win?.minimize())
  ipcMain.on('close', () => win?.close())
  ipcMain.on('maximize-toggle', () => {
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('get-backend-status', () => backendStatus)

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

  createWindow()
  void startPythonBackend()
})
