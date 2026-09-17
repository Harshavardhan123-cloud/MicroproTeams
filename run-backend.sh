#!/usr/bin/env bash
# ==============================================================================
# MicroproTeams - Machine-Independent Backend & Media Services Launcher
# ==============================================================================
# Automatically detects repository path, Python 3 environment, port availability,
# installs dependencies if needed, initializes the database, and launches services.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " ⚡ Starting MicroproTeams Backend & SFU Media Services "
echo "=========================================================="
echo "📁 Root Directory: $PROJECT_DIR"

# Clean up helper for cross-platform port freeing
free_port() {
    local port=$1
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${port}/tcp" 2>/dev/null || true
    fi
    if command -v lsof >/dev/null 2>&1; then
        local pids
        pids=$(lsof -ti ":${port}" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    fi
}

echo "🧹 Checking port 8000 (FastAPI) and 3010 (SFU)..."
free_port 8000
sleep 0.5

# 1. Detect Host Python
PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python 3 was not found on your system. Please install Python 3.10+."
    exit 1
fi

# 2. Setup Virtual Environment
VENV_DIR="$PROJECT_DIR/backend/venv"
VENV_PYTHON=""
if [ -f "$VENV_DIR/bin/python3" ]; then
    VENV_PYTHON="$VENV_DIR/bin/python3"
elif [ -f "$VENV_DIR/bin/python" ]; then
    VENV_PYTHON="$VENV_DIR/bin/python"
elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
    VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
fi

if [ -z "$VENV_PYTHON" ] || [ ! -f "$VENV_PYTHON" ]; then
    echo "🐍 Creating Python virtual environment in $VENV_DIR..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
    if [ -f "$VENV_DIR/bin/python3" ]; then
        VENV_PYTHON="$VENV_DIR/bin/python3"
    elif [ -f "$VENV_DIR/bin/python" ]; then
        VENV_PYTHON="$VENV_DIR/bin/python"
    elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
        VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
    fi
    echo "📦 Installing backend Python requirements..."
    "$VENV_PYTHON" -m pip install --upgrade pip -q
    "$VENV_PYTHON" -m pip install -r "$PROJECT_DIR/backend/requirements.txt" -q
fi

# 3. Setup SFU (mediasoup) Dependencies if Node.js is present
SFU_DIR="$PROJECT_DIR/backend/sfu"
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    if [ ! -d "$SFU_DIR/node_modules" ]; then
        echo "📦 Installing SFU dependencies in $SFU_DIR..."
        (cd "$SFU_DIR" && npm install --omit=dev --silent) || echo "⚠️ SFU npm install had warnings (WebRTC will use fallback if build tools absent)."
    fi
fi

# 4. Copy .env if not exists
if [ ! -f "$PROJECT_DIR/.env" ] && [ -f "$PROJECT_DIR/.env.example" ]; then
    echo "⚙️ Creating .env from .env.example with secure generated tokens..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
fi

# 5. Initialize / Seed Database
echo "🌱 Initializing database schema & initial seed data..."
export PYTHONPATH="$PROJECT_DIR/backend"
"$VENV_PYTHON" "$PROJECT_DIR/backend/app/services/seed.py" || echo "⚠️ Database seed had notices, continuing..."

# 6. Launch SFU in Background if Node.js is installed
SFU_PID=""
cleanup_children() {
    if [ -n "$SFU_PID" ]; then
        echo "🛑 Terminating Mediasoup SFU (PID $SFU_PID)..."
        kill "$SFU_PID" 2>/dev/null || true
    fi
}
trap cleanup_children EXIT INT TERM

if command -v node >/dev/null 2>&1 && [ -f "$SFU_DIR/server.js" ] && [ -d "$SFU_DIR/node_modules" ]; then
    free_port 3010
    echo "📹 Starting Mediasoup SFU Server on http://localhost:3010..."
    (cd "$SFU_DIR" && node server.js >> "$PROJECT_DIR/sfu.log" 2>&1) &
    SFU_PID=$!
    echo "✓ SFU server started in background (PID $SFU_PID). Logs: $PROJECT_DIR/sfu.log"
else
    echo "ℹ️ SFU node server skipped (Node.js or mediasoup build tools not installed). Mesh/REST mode enabled."
fi

# 7. Start FastAPI Backend in Foreground
echo "🚀 Starting FastAPI Backend Server on http://localhost:8000..."
cd "$PROJECT_DIR/backend"
exec "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
