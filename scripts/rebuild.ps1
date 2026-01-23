# Rebuild Script for Link Downloader App

Write-Host "Starting clean build process..." -ForegroundColor Cyan

# Set Project Root (parent of the 'scripts' folder)
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Gray
Set-Location $ProjectRoot

# 1. Clean previous builds
Write-Host "Cleaning previous artifacts..." -ForegroundColor Yellow
$dirsToClean = @(
    "dist", 
    "dist-electron", 
    "release", 
    "python_backend/build", 
    "python_backend/dist"
)

foreach ($dir in $dirsToClean) {
    if (Test-Path $dir) {
        Write-Host "Removing $dir..."
        Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 2. Build Python Backend
Write-Host "Building Python backend..." -ForegroundColor Yellow
if (Test-Path "python_backend/backend.spec") {
    Push-Location python_backend
    try {
        # Check for Python
        if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
            Write-Error "Python not found in PATH! Please install Python."
            Pop-Location
            exit 1
        }

        # Install requirements and pyinstaller if needed
        Write-Host "Installing/Updating dependencies..." -ForegroundColor Gray
        pip install -r requirements.txt
        pip install pyinstaller

        # Check if pyinstaller is available (it should be now)
        if (Get-Command "pyinstaller" -ErrorAction SilentlyContinue) {
            pyinstaller backend.spec
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Python backend build failed!"
                Pop-Location
                exit 1
            }
        } else {
            # Try running via python -m PyInstaller
            python -m PyInstaller backend.spec
            if ($LASTEXITCODE -ne 0) {
                 Write-Error "Python backend build failed (even with python -m PyInstaller)!"
                 Pop-Location
                 exit 1
            }
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Error "python_backend/backend.spec not found!"
    exit 1
}

# 3. Build Electron App
Write-Host "Building Electron application..." -ForegroundColor Yellow
# Ensure npm dependencies are installed (optional, can be slow, but safer for automation)
# npm install 

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron build failed!"
    exit 1
}

Write-Host "Build complete! Check the 'release' folder." -ForegroundColor Green
