#!/usr/bin/env bash
# ==============================================================================
# MicroproTeams - Cloudflare HTTPS Tunnel Launcher
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🔒 Starting Secure HTTPS Tunnel for MicroproTeams "
echo "=========================================================="
echo "📁 Root Directory: $PROJECT_DIR"
echo " Tunneling HTTPS traffic to local port 3000..."
echo " Press Ctrl+C to stop the tunnel."
echo "=========================================================="

echo "⚡ Launching Cloudflare HTTPS Tunnel..."
exec npx -y cloudflared tunnel --url http://localhost:3000 --http-host-header localhost
