@echo off
REM ============================================================================
REM  Bench - build the Windows installer
REM
REM    build.bat              full build to the last folder used
REM    build.bat "C:\out"     build there, and remember it for next time
REM    build.bat --fast       skip the Python backend (reuse the last backend.exe)
REM
REM  The output folder defaults to "D:\linkdownload testing" and is remembered
REM  in .build-output once you pass one explicitly. Before packaging, the old
REM  installer, win-unpacked, and any Bench installed *inside* that folder are
REM  deleted, so there is never a stale copy left to run by mistake. Installs
REM  outside the output folder are not touched.
REM
REM  The backend takes a few minutes to freeze and rarely changes, so use
REM  --fast when you have only touched the UI.
REM
REM  NOTE: this file must keep CRLF line endings. cmd.exe mis-parses
REM  parenthesised blocks when a .bat uses bare LF.
REM ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "OUTDIR=D:\linkdownload testing"
set "SKIP_BACKEND="
set "OUTFILE=%~dp0.build-output"

REM Reuse the last folder built to, so the path is only given once.
if exist "%OUTFILE%" (
    for /f "usebackq delims=" %%L in ("%OUTFILE%") do (
        if not "%%L"=="" set "OUTDIR=%%L"
    )
)

REM ---- arguments (order independent) -----------------------------------------
set "OUTDIR_GIVEN="
for %%A in (%*) do (
    if /I "%%~A"=="--fast" (
        set "SKIP_BACKEND=1"
    ) else if /I "%%~A"=="--ui" (
        set "SKIP_BACKEND=1"
    ) else (
        set "OUTDIR=%%~A"
        set "OUTDIR_GIVEN=1"
    )
)

REM Remember an explicitly chosen folder for next time.
if defined OUTDIR_GIVEN (
    > "%OUTFILE%" echo !OUTDIR!
)

echo.
echo ============================================================
echo   Bench build
echo   Output: !OUTDIR!
if defined SKIP_BACKEND echo   Mode:   fast (reusing existing backend.exe)
echo ============================================================
echo.

REM ---- prerequisites ---------------------------------------------------------
if not exist "python_backend\.venv\Scripts\python.exe" (
    echo [!] No Python venv found.
    echo     Run this first:  npm run setup:backend
    goto :failed
)

if not exist "node_modules" (
    echo [1/4] Installing npm dependencies...
    call npm install
    if errorlevel 1 goto :failed
) else (
    echo [1/4] npm dependencies present.
)

REM ---- backend ---------------------------------------------------------------
if defined SKIP_BACKEND (
    if not exist "python_backend\dist\backend.exe" (
        echo [!] --fast was given but python_backend\dist\backend.exe does not exist.
        echo     Run a full build once before using --fast.
        goto :failed
    )
    echo [2/4] Skipping backend build.
) else (
    echo [2/4] Building backend.exe with PyInstaller ^(a few minutes^)...
    REM PyInstaller cannot overwrite a locked exe.
    taskkill /F /IM backend.exe >nul 2>&1
    pushd python_backend
    ".venv\Scripts\pyinstaller.exe" backend.spec --noconfirm --distpath dist --workpath build
    if errorlevel 1 (
        popd
        goto :failed
    )
    popd
    if not exist "python_backend\dist\backend.exe" (
        echo [!] PyInstaller finished but backend.exe is missing.
        goto :failed
    )
)

REM ---- renderer --------------------------------------------------------------
echo [3/4] Type-checking and building the UI...
call npm run build
if errorlevel 1 goto :failed

REM ---- installer -------------------------------------------------------------
echo [4/4] Packaging the installer...

REM Bench must not be running: electron-builder cannot replace files in use.
taskkill /F /IM Bench.exe >nul 2>&1
taskkill /F /IM backend.exe >nul 2>&1
REM Give Windows a moment to release the handles.
ping -n 3 127.0.0.1 >nul 2>&1

REM Clear the previous build so no stale installer is left next to the new one,
REM and no leftover win-unpacked keeps files locked.
if exist "!OUTDIR!" (
    echo       Clearing previous build in "!OUTDIR!"
    if exist "!OUTDIR!\win-unpacked" rmdir /S /Q "!OUTDIR!\win-unpacked"
    if exist "!OUTDIR!\win-unpacked.tmp" rmdir /S /Q "!OUTDIR!\win-unpacked.tmp"
    del /Q "!OUTDIR!\*.exe" >nul 2>&1
    del /Q "!OUTDIR!\*.blockmap" >nul 2>&1
    del /Q "!OUTDIR!\*.7z" >nul 2>&1
    del /Q "!OUTDIR!\*.yml" >nul 2>&1

    REM Remove any Bench installed *inside* the output folder, so there is no
    REM stale copy left to launch by mistake. Only touches installs under this
    REM folder - a Bench installed anywhere else is left alone.
    for /f "delims=" %%E in ('dir /S /B "!OUTDIR!\Bench.exe" 2^>nul') do (
        set "FOUND=%%~dpE"
        echo !FOUND! | find /I "win-unpacked" >nul
        if errorlevel 1 (
            echo       Removing installed copy: !FOUND!
            rmdir /S /Q "!FOUND!" 2>nul
        )
    )
) else (
    mkdir "!OUTDIR!"
)

REM ELECTRON_RUN_AS_NODE makes electron behave as plain node and breaks packaging.
set "ELECTRON_RUN_AS_NODE="

call npx electron-builder --win --config.directories.output="!OUTDIR!"
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo   Done.
echo ============================================================
for %%F in ("!OUTDIR!\*Setup*.exe") do echo   Installer: %%~fF
echo   Portable:  !OUTDIR!\win-unpacked\Bench.exe
echo.
endlocal
exit /b 0

:failed
echo.
echo [X] Build failed. See the output above.
endlocal
exit /b 1
