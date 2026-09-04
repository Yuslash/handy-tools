import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const venvPythonWin = path.join(root, 'python_backend', '.venv', 'Scripts', 'python.exe')
const venvPythonUnix = path.join(root, 'python_backend', '.venv', 'bin', 'python')

let pythonExe = 'python'
if (process.platform === 'win32' && fs.existsSync(venvPythonWin)) {
  pythonExe = venvPythonWin
} else if (fs.existsSync(venvPythonUnix)) {
  pythonExe = venvPythonUnix
}

const testScript = path.join(root, 'python_backend', 'tests', 'test_backend_core.py')

console.log(`[test:backend] Using Python: ${pythonExe}`)
const result = spawnSync(pythonExe, [testScript], {
  stdio: 'inherit',
  cwd: path.join(root, 'python_backend'),
})

process.exit(result.status ?? 1)
