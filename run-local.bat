@echo off
REM ==============================================================================
REM MicroproTeams - Windows Local Stack Launcher (Double-Clickable)
REM ==============================================================================
setlocal

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ==========================================================
echo  Launching MicroproTeams Full Application Stack
echo ==========================================================

start "Micropro Backend" cmd /k "call \"%PROJECT_DIR%\run-backend.bat\""
timeout /t 3 /nobreak >nul
start "Micropro Frontend" cmd /k "call \"%PROJECT_DIR%\run-frontend.bat\""

echo Services started in separate terminal windows.
echo - Backend:  http://localhost:8000
echo - Frontend: http://localhost:3000

