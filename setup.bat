@echo off
REM ==============================================================================
REM MicroproTeams - Windows Machine Environment Setup
REM ==============================================================================
setlocal enabledelayedexpansion

echo ======================================================================
echo   MicroproTeams - Windows Environment Setup
echo ======================================================================

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo [1/5] Checking Prerequisites...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in PATH. Please install Python 3.10+ from python.org.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in PATH. Please install Node.js 18+ from nodejs.org.
    pause
    exit /b 1
)

echo [2/5] Setting up Environment Variables (.env)...
if not exist "%PROJECT_DIR%\.env" (
    if exist "%PROJECT_DIR%\.env.example" (
        echo Creating .env from .env.example...
        copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env" >nul
    )
)

echo [3/5] Setting up Backend Python Virtual Environment...
if not exist "%PROJECT_DIR%\backend\venv" (
    echo Creating virtualenv at backend\venv...
    python -m venv "%PROJECT_DIR%\backend\venv"
)

echo Installing backend dependencies...
call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" -m pip install --upgrade pip -q
call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" -m pip install -r "%PROJECT_DIR%\backend\requirements.txt" -q

echo [4/5] Installing Frontend Dependencies...
cd /d "%PROJECT_DIR%\frontend"
call npm install
cd /d "%PROJECT_DIR%"

echo [5/5] Initializing Database Schema and Demo Data...
set "PYTHONPATH=%PROJECT_DIR%\backend"
call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" "%PROJECT_DIR%\backend\app\services\seed.py"

echo ======================================================================
echo   Setup Complete!
echo   Run 'run-local.bat' or 'run-local.ps1' to start the application.
echo ======================================================================
pause

