#!/usr/bin/env bash
# ==============================================================================
# MicroproTeams - Universal Machine Setup Script
# ==============================================================================
# Run this script once after cloning to prepare the entire repository on any
# machine (Linux, macOS, Windows with Git Bash/WSL).
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}======================================================================${RESET}"
echo -e "${BOLD}${CYAN}  🛠️  MicroproTeams - Universal Machine Environment Setup  ${RESET}"
echo -e "${BOLD}${CYAN}======================================================================${RESET}"
echo -e "📁 Target Directory: ${PROJECT_DIR}\n"

# ------------------------------------------------------------------------------
# 1. Check Prerequisites
# ------------------------------------------------------------------------------
echo -e "${BOLD}[1/5] Checking system prerequisites...${RESET}"

# Check Python 3
PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo -e "${RED}❌ Python 3 was not found. Please install Python 3.10+ (https://www.python.org/downloads/)${RESET}"
    exit 1
fi

PY_VERSION=$("$PYTHON_CMD" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo -e "${GREEN}✓ Python installed:${RESET} $($PYTHON_CMD --version) (detected binary: $PYTHON_CMD)"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js was not found. Please install Node.js 18+ (https://nodejs.org)${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js installed:${RESET} $(node -v)"

# Check NPM
if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}❌ NPM was not found.${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ NPM installed:${RESET} $(npm -v)"

# Check Docker (optional)
if command -v docker >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker installed:${RESET} $(docker --version)"
else
    echo -e "${YELLOW}ℹ️  Docker not detected (optional, required only for containerized deployment).${RESET}"
fi

# ------------------------------------------------------------------------------
# 2. Environment Configuration (.env)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[2/5] Configuring environment variables...${RESET}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating fresh .env from .env.example with secure random secrets...${RESET}"
    
    GEN_JWT_SECRET=$("$PYTHON_CMD" -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
    GEN_REFRESH_SECRET=$("$PYTHON_CMD" -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
    GEN_PG_PASSWORD=$("$PYTHON_CMD" -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null || openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

    cp .env.example .env
    # Replace example secrets with generated tokens
    sed -i.bak "s|CHANGE_ME_generate_a_random_secret_do_not_use_this_literal_value|${GEN_JWT_SECRET}|g" .env 2>/dev/null || true
    sed -i.bak "s|CHANGE_ME_generate_a_different_random_secret_do_not_use_this_literal_value|${GEN_REFRESH_SECRET}|g" .env 2>/dev/null || true
    sed -i.bak "s|teams_password_secret|${GEN_PG_PASSWORD}|g" .env 2>/dev/null || true
    rm -f .env.bak 2>/dev/null || true
    echo -e "${GREEN}✓ Created .env with generated cryptographic secrets.${RESET}"
else
    echo -e "${GREEN}✓ Existing .env found.${RESET}"
fi

# ------------------------------------------------------------------------------
# 3. Python Virtual Environment & Backend Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[3/5] Setting up backend Python virtual environment...${RESET}"

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
    echo "Creating virtual environment at $VENV_DIR..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
    if [ -f "$VENV_DIR/bin/python3" ]; then
        VENV_PYTHON="$VENV_DIR/bin/python3"
    elif [ -f "$VENV_DIR/bin/python" ]; then
        VENV_PYTHON="$VENV_DIR/bin/python"
    elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
        VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
    fi
fi

echo "Installing Python dependencies (including SQLite & async support)..."
"$VENV_PYTHON" -m pip install --upgrade pip -q
"$VENV_PYTHON" -m pip install -r "$PROJECT_DIR/backend/requirements.txt" -q
echo -e "${GREEN}✓ Backend Python dependencies installed successfully.${RESET}"

# ------------------------------------------------------------------------------
# 4. Install Node.js Dependencies (SFU & Frontend)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/5] Installing Node.js dependencies (SFU and Frontend)...${RESET}"

echo "Installing SFU media dependencies..."
(cd "$PROJECT_DIR/backend/sfu" && npm install --omit=dev --silent) || echo "⚠️ SFU install had notices (native build tools optional for local REST/mesh)."

echo "Installing Frontend dependencies..."
(cd "$PROJECT_DIR/frontend" && npm install --silent)
echo -e "${GREEN}✓ Frontend packages installed successfully.${RESET}"

# ------------------------------------------------------------------------------
# 5. Database Schema & Initial Seed Data
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[5/5] Initializing database schema & demo seed accounts...${RESET}"
export PYTHONPATH="$PROJECT_DIR/backend"
"$VENV_PYTHON" "$PROJECT_DIR/backend/app/services/seed.py"
echo -e "${GREEN}✓ Database initialized and ready.${RESET}"

# ------------------------------------------------------------------------------
# Summary & Next Steps
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${GREEN}======================================================================${RESET}"
echo -e "${BOLD}${GREEN}  🎉 Machine Environment Setup Completed Successfully!  ${RESET}"
echo -e "${BOLD}${GREEN}======================================================================${RESET}"
echo -e "You can now run MicroproTeams using any of these options:\n"
echo -e "  ${CYAN}1. Full Stack (Backend + Frontend):${RESET}"
echo -e "     ${BOLD}./run-local.sh${RESET}\n"
echo -e "  ${CYAN}2. Run Separately:${RESET}"
echo -e "     Backend:  ${BOLD}./run-backend.sh${RESET}"
echo -e "     Frontend: ${BOLD}./run-frontend.sh${RESET}\n"
echo -e "  ${CYAN}3. Run in Docker Containers:${RESET}"
echo -e "     ${BOLD}docker compose up --build${RESET}\n"
echo -e "Default Demo Credentials:"
echo -e "  Email:    ${BOLD}admin@example.com${RESET}"
echo -e "  Password: ${BOLD}password123${RESET}"
echo -e "======================================================================\n"

