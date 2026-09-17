#!/usr/bin/env bash
# ==============================================================================
# MicroproTeams - Machine-Independent Full Application Stack Launcher
# ==============================================================================
# Launches both the Backend (FastAPI + SFU) and Frontend (React + Vite) in one
# terminal with automatic directory detection, port handling, and clean shutdown.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🚀 Launching MicroproTeams Full Application Stack "
echo "=========================================================="
echo "📁 Root Directory: $PROJECT_DIR"
echo " Usage Options:"
echo "   - Run Backend separately:  ./run-backend.sh"
echo "   - Run Frontend separately: ./run-frontend.sh"
echo "   - Run in Docker:           docker compose up --build"
echo "=========================================================="

BACKEND_PID=""

cleanup() {
    echo -e "\n🛑 Gracefully shutting down MicroproTeams stack..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    # Also clean up any child processes
    pkill -P $$ 2>/dev/null || true
    echo "✓ All services stopped."
    exit 0
}

trap cleanup INT TERM EXIT

# Start backend in background
echo "⚡ Starting Backend & SFU in background..."
./run-backend.sh &
BACKEND_PID=$!

echo "Backend started (PID $BACKEND_PID)."
echo "⏳ Waiting for backend to initialize..."
sleep 2

# Start frontend in foreground
echo "🎨 Starting Frontend..."
./run-frontend.sh
