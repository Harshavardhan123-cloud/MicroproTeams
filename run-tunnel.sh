#!/bin/bash
set -e

PROJECT_DIR="/home/hchatte/Desktop/MS"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🔒 Starting Secure HTTPS Tunnel for Micropro_Commute "
echo "=========================================================="
echo " Tunneling HTTPS traffic on port 3000..."
echo " Press Ctrl+C to stop the tunnel."
echo "=========================================================="

echo "⚡ Launching Cloudflare HTTPS Tunnel..."
exec npx -y cloudflared tunnel --url http://localhost:3000 --http-host-header localhost
