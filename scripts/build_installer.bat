@echo off
TITLE Building Link Downloader App...

echo Starting build process...
echo This will clean old files and rebuild the application.

:: Run the PowerShell script with Bypass execution policy
powershell.exe -ExecutionPolicy Bypass -File "%~dp0rebuild.ps1"

echo.
echo ===================================================
echo   Build process finished.
echo   Check the output above for any errors.
echo ===================================================
echo.
pause
