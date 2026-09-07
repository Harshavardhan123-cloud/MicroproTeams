#!/bin/bash
set -e

PROJECT_DIR="/home/hchatte/Desktop/MS"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🚀 Launching MicroproTeams Full Application Stack "
echo "=========================================================="
echo " Usage Options:"
echo "   - Run Backend separately:  ./run-backend.sh"
echo "   - Run Frontend separately: ./run-frontend.sh"
echo "=========================================================="

# Start backend in background using run-backend.sh logic
./run-backend.sh &
BACKEND_PID=$!

echo "Backend started in background process (PID $BACKEND_PID)."
echo "Starting frontend dev server..."

./run-frontend.sh
