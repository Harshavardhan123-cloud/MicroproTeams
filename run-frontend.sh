#!/bin/bash
set -e

PROJECT_DIR="/home/hchatte/Desktop/MS"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🎨 Starting React + Vite Frontend Dev Server "
echo "=========================================================="

# Kill any existing frontend vite processes and release port 3000
echo "🧹 Cleaning up existing frontend processes on port 3000..."
pkill -9 -f "vite" 2>/dev/null || true
fuser -k -9 3000/tcp 2>/dev/null || true
lsof -t -i:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
# docker stop micropro_mediasoup 2>/dev/null || true
sleep 1.5

# Install frontend dependencies if needed
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$PROJECT_DIR/frontend"
    npm install
    cd "$PROJECT_DIR"
fi

# Start Frontend Dev Server on https://localhost:3000
echo "🚀 Launching Vite HTTPS dev server on https://localhost:3000..."
cd "$PROJECT_DIR/frontend"
exec npm run dev
