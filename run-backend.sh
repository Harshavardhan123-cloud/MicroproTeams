#!/bin/bash
set -e

PROJECT_DIR="/home/hchatte/Desktop/MS"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " ⚡ Starting Enterprise Backend & SFU Media Services "
echo "=========================================================="

# Kill any existing backend or SFU processes and release ports 8000 and 3010
echo "🧹 Cleaning up existing backend/SFU processes..."
pkill -9 -f "uvicorn app.main:app" 2>/dev/null || true
pkill -9 -f "node server.js" 2>/dev/null || true
fuser -k 8000/tcp 3010/tcp 2>/dev/null || true
sleep 1

# Check Python virtual environment
if [ ! -d "$PROJECT_DIR/backend/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$PROJECT_DIR/backend/venv"
    "$PROJECT_DIR/backend/venv/bin/pip" install --upgrade pip -q
    "$PROJECT_DIR/backend/venv/bin/pip" install -r "$PROJECT_DIR/backend/requirements.txt" -q
fi

# Install SFU (mediasoup) dependencies if needed
if [ ! -d "$PROJECT_DIR/backend/sfu/node_modules" ]; then
    echo "Installing SFU (mediasoup) dependencies..."
    cd "$PROJECT_DIR/backend/sfu"
    npm install
    cd "$PROJECT_DIR"
fi

# Seed Database
echo "🌱 Initializing database schema & Acme Corp seed data..."
cd "$PROJECT_DIR/backend"
PYTHONPATH="$PROJECT_DIR/backend" "$PROJECT_DIR/backend/venv/bin/python3" app/services/seed.py

# Start SFU (Mediasoup) Server for group video/audio calls in background
echo "📹 Starting Mediasoup SFU Server on http://localhost:3010..."
cd "$PROJECT_DIR/backend/sfu"
nohup node server.js > "$PROJECT_DIR/sfu.log" 2>&1 &
SFU_PID=$!
echo "SFU server running with PID $SFU_PID. Logs at $PROJECT_DIR/sfu.log"
cd "$PROJECT_DIR"

# Cleanup background SFU server on exit
cleanup() {
    echo "Stopping SFU server (PID $SFU_PID)..."
    kill $SFU_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start FastAPI Backend Server in foreground
echo "⚡ Starting FastAPI Backend Server on http://localhost:8000..."
cd "$PROJECT_DIR/backend"
exec env PYTHONPATH="$PROJECT_DIR/backend" "$PROJECT_DIR/backend/venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload
