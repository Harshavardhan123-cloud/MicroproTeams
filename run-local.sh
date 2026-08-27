#!/bin/bash
set -e

PROJECT_DIR="/home/hchatte/Desktop/MS"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🚀 Launching Enterprise Teams Collaboration Platform "
echo "=========================================================="

# Check Python environment
if [ ! -d "$PROJECT_DIR/backend/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$PROJECT_DIR/backend/venv"
    "$PROJECT_DIR/backend/venv/bin/pip" install --upgrade pip -q
    "$PROJECT_DIR/backend/venv/bin/pip" install -r "$PROJECT_DIR/backend/requirements.txt" -q
fi

# Install frontend dependencies if needed
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$PROJECT_DIR/frontend"
    npm install
    cd "$PROJECT_DIR"
fi

# Seed Database (Handles Postgres or SQLite automatic fallback)
echo "🌱 Initializing database schema & Acme Corp seed data..."
cd "$PROJECT_DIR/backend"
PYTHONPATH="$PROJECT_DIR/backend" "$PROJECT_DIR/backend/venv/bin/python3" app/services/seed.py

# Start Backend Server
echo "⚡ Starting FastAPI Backend Server on http://localhost:8000..."
nohup env PYTHONPATH="$PROJECT_DIR/backend" "$PROJECT_DIR/backend/venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend running with PID $BACKEND_PID. Logs at $PROJECT_DIR/backend.log"

# Start Frontend Dev Server
echo "🎨 Starting React + Vite Frontend Dev Server on http://localhost:3000..."
cd "$PROJECT_DIR/frontend"
npm run dev
