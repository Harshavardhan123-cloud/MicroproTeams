@echo off
REM ==============================================================================
REM MicroproTeams - Windows Frontend Launcher
REM ==============================================================================
setlocal

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%\frontend"

echo ==========================================================
echo  Starting MicroproTeams Frontend (Vite)
echo ==========================================================

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting Vite on http://localhost:3000...
call npm run dev

