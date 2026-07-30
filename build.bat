@echo off
REM ============================================================================
REM  Bench - build the Windows installer
REM
REM    build.bat              full build, output to "D:\linkdownload testing"
REM    build.bat "C:\out"     full build, output to a folder you choose
REM    build.bat --fast       skip the Python backend (reuse the last backend.exe)
REM
REM  The backend takes a few minutes to freeze and rarely changes, so use
REM  --fast when you have only touched the UI.
REM ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "OUTDIR=D:\linkdownload testing"
set "SKIP_BACKEND="

REM ---- arguments (order independent) -----------------------------------------
for %%A in (%*) do (
    if /I "%%~A"=="--fast"  (set "SKIP_BACKEND=1") else (
    if /I "%%~A"=="--ui"    (set "SKIP_BACKEND=1") else (
        set "OUTDIR=%%~A"
    ))
)

echo.
echo ============================================================
echo   Bench build
echo   Output: %OUTDIR%
if defined SKIP_BACKEND echo   Mode:   fast ^(reusing existing backend.exe^)
echo ============================================================
echo.

REM ---- prerequisites ---------------------------------------------------------
if not exist "python_backend\.venv\Scripts\python.exe" (
    echo [!] No Python venv found.
    echo     Run this first:  npm run setup:backend
    exit /b 1
)

if not exist "node_modules" (
    echo [1/4] Installing npm dependencies...
    call npm install || goto :failed
) else (
    echo [1/4] npm dependencies present.
)

REM ---- backend ---------------------------------------------------------------
if defined SKIP_BACKEND (
    if not exist "python_backend\dist\backend.exe" (
        echo [!] --fast was given but python_backend\dist\backend.exe does not exist.
        echo     Run a full build once before using --fast.
        exit /b 1
    )
    echo [2/4] Skipping backend build.
) else (
    echo [2/4] Building backend.exe with PyInstaller ^(a few minutes^)...
    REM Stop a running backend first; PyInstaller cannot overwrite a locked exe.
    taskkill /F /IM backend.exe >nul 2>&1
    pushd python_backend
    ".venv\Scripts\pyinstaller.exe" backend.spec --noconfirm --distpath dist --workpath build
    if errorlevel 1 (popd & goto :failed)
    popd
    if not exist "python_backend\dist\backend.exe" (
        echo [!] PyInstaller reported success but backend.exe is missing.
        goto :failed
    )
)

REM ---- renderer --------------------------------------------------------------
echo [3/4] Type-checking and building the UI...
call npm run build || goto :failed

REM ---- installer -------------------------------------------------------------
echo [4/4] Packaging the installer...
REM Bench must not be running: electron-builder cannot replace files in use.
taskkill /F /IM Bench.exe >nul 2>&1
taskkill /F /IM backend.exe >nul 2>&1

REM ELECTRON_RUN_AS_NODE makes electron behave as plain node and breaks packaging.
set "ELECTRON_RUN_AS_NODE="

call npx electron-builder --win --config.directories.output="%OUTDIR%" || goto :failed

echo.
echo ============================================================
echo   Done.
echo ============================================================
for %%F in ("%OUTDIR%\*Setup*.exe") do echo   Installer: %%~fF  (%%~zF bytes)
echo   Portable:  %OUTDIR%\win-unpacked\Bench.exe
echo.
endlocal
exit /b 0

:failed
echo.
echo [X] Build failed. See the output above.
endlocal
exit /b 1
