@echo off
REM ==============================================================================
REM MicroproTeams - Windows Backend Launcher
REM ==============================================================================
setlocal

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ==========================================================
echo  Starting MicroproTeams Backend (FastAPI)
echo ==========================================================

if not exist "%PROJECT_DIR%\backend\venv" (
    echo Creating virtualenv...
    python -m venv "%PROJECT_DIR%\backend\venv"
    call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" -m pip install -r "%PROJECT_DIR%\backend\requirements.txt" -q
)

set "PYTHONPATH=%PROJECT_DIR%\backend"
echo Initializing database...
call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" "%PROJECT_DIR%\backend\app\services\seed.py"

echo Starting FastAPI server on http://localhost:8000...
cd /d "%PROJECT_DIR%\backend"
call "%PROJECT_DIR%\backend\venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

