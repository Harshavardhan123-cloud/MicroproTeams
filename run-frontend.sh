#!/usr/bin/env bash
# ==============================================================================
# MicroproTeams - Machine-Independent Frontend Dev Server Launcher
# ==============================================================================
# Automatically detects repository path, Node.js & NPM, port availability,
# installs node_modules if needed, and launches Vite dev server.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🎨 Starting MicroproTeams React + Vite Frontend "
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

echo "🧹 Checking port 3000 (Vite)..."
free_port 3000
sleep 0.5

# 1. Check Node.js and NPM
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Node.js is not installed. Please install Node.js 18+ (https://nodejs.org)."
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ Error: NPM is not installed."
    exit 1
fi

echo "✓ Node.js version: $(node -v)"
echo "✓ NPM version: $(npm -v)"

# 2. Check and Install Frontend Dependencies
FRONTEND_DIR="$PROJECT_DIR/frontend"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "📦 Installing frontend dependencies in $FRONTEND_DIR..."
    cd "$FRONTEND_DIR"
    npm install
    cd "$PROJECT_DIR"
fi

# 3. Launch Vite Dev Server
echo "🚀 Launching Vite Dev Server on http://localhost:3000..."
cd "$FRONTEND_DIR"
exec npm run dev
