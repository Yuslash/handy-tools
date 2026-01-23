import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn, ChildProcess, execSync } from 'node:child_process'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let pythonProcess: ChildProcess | null = null

function log(msg: string) {
  console.log(`[Electron Main] ${msg}`)
}

function findGitRoot(startPath: string): string | null {
  let currentDir = startPath
  while (true) {
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir
    }
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      // Reached root
      return null
    }
    currentDir = parentDir
  }
}

function checkForUpdates(): boolean {
  if (!app.isPackaged) {
    log('Skipping update check in dev mode')
    return false
  }

  // Find git root starting from executable location
  // In packaged app, exe is in root or dist/win-unpacked
  const startPath = path.dirname(app.getPath('exe'))
  const gitRoot = findGitRoot(startPath)

  if (!gitRoot) {
    log('No .git directory found in parent hierarchy, skipping update check')
    return false
  }

  try {
    log(`Checking for updates in ${gitRoot}...`)
    // Configure git to not ask for credentials to avoid hanging
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

    // Fetch latest from remote
    execSync('git fetch origin main', {
      cwd: gitRoot,
      env: gitEnv,
      encoding: 'utf-8',
      timeout: 15000
    })

    const localHead = execSync('git rev-parse HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim()
    const remoteHead = execSync('git rev-parse origin/main', { cwd: gitRoot, encoding: 'utf-8' }).trim()

    if (localHead !== remoteHead) {
      log(`Update found! Local: ${localHead}, Remote: ${remoteHead}. Updating...`)

      // Hard reset to latest remote
      execSync('git reset --hard origin/main', {
        cwd: gitRoot,
        encoding: 'utf-8'
      })

      log('Update applied successfully. Restarting application...')

      // Relaunch and quit
      app.relaunch()
      app.quit()
      return true
    } else {
      log('Application is up to date.')
      return false
    }
  } catch (error) {
    console.error('Failed to check for updates:', error)
    return false
  }
}

// Kill any existing process on port 8000
function killExistingBackend() {
  try {
    if (process.platform === 'win32') {
      // Find and kill process using port 8000 on Windows
      const result = execSync('netstat -ano | findstr :8000 | findstr LISTENING', { encoding: 'utf-8', timeout: 5000 })
      const lines = result.trim().split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && !isNaN(parseInt(pid))) {
          log(`Killing existing process on port 8000 (PID: ${pid})`)
          try {
            execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8', timeout: 5000 })
          } catch (e) {
            // Process might already be dead
          }
        }
      }
    } else {
      // Unix/Mac: kill process on port 8000
      try {
        execSync('lsof -ti:8000 | xargs kill -9', { encoding: 'utf-8', timeout: 5000 })
      } catch (e) {
        // No process found
      }
    }
  } catch (e) {
    // No process found on port 8000, which is fine
    log('No existing backend process found on port 8000')
  }
}

function startPythonBackend() {
  // Kill any existing process first
  killExistingBackend()

  // Wait a moment for port to be released
  setTimeout(() => {
    let executable: string
    let args: string[] = []

    if (app.isPackaged) {
      executable = path.join(process.resourcesPath, 'backend.exe')
    } else {
      executable = 'python'
      args = [path.join(process.env.APP_ROOT, 'python_backend', 'app', 'api', 'server.py')]
    }

    log(`Starting Python backend from ${executable}`)

    pythonProcess = spawn(executable, args)

    pythonProcess.stdout?.on('data', (data) => {
      log(`Python stdout: ${data}`)
    })

    pythonProcess.stderr?.on('data', (data) => {
      console.error(`Python stderr: ${data}`)
    })

    pythonProcess.on('close', (code) => {
      log(`Python process exited with code ${code}`)
    })
  }, 500)
}

function stopPythonBackend() {
  if (pythonProcess) {
    log('Stopping Python backend...')
    try {
      if (process.platform === 'win32') {
        // On Windows, kill the process tree
        execSync(`taskkill /F /T /PID ${pythonProcess.pid}`, { encoding: 'utf-8' })
      } else {
        pythonProcess.kill('SIGTERM')
      }
    } catch (e) {
      log(`Error stopping backend: ${e}`)
    }
    pythonProcess = null
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Keep frameless for custom UI
    transparent: false, // Disable transparency for stability
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    backgroundColor: '#09090b' // Solid dark background (Zinc-950)
  })

  // Maximize the window to give the "Full Screen" feel requested
  win.maximize()

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Clean up python backend just in case
  win.on('close', () => {
    stopPythonBackend()
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

app.on('will-quit', () => {
  stopPythonBackend()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  ipcMain.on('minimize', () => win?.minimize())
  ipcMain.on('close', () => win?.close())
  ipcMain.on('open-downloads', () => {
    // Open the user's downloads folder 
    // Note: The python backend defaults to Path.home() / "Downloads"
    // We can assume this standard location or generic downloads path
    const downloadsPath = app.getPath('downloads')
    import('electron').then(({ shell }) => {
      shell.openPath(downloadsPath)
    })
  })

  ipcMain.handle('select-directory', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Download Location',
      buttonLabel: 'Select Folder'
    })

    if (result.canceled) {
      return null
    } else {
      return result.filePaths[0]
    }
  })

  ipcMain.handle('select-file', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Select Video File',
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled) {
      return null
    } else {
      return result.filePaths[0]
    }
  })

  // Check for updates before doing anything else
  if (!checkForUpdates()) {
    startPythonBackend()
    createWindow()
  }
})
