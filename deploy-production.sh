#!/usr/bin/env bash
# ==============================================================================
# Micropro Commute - Production Deployment Script
# ==============================================================================
# Automates Docker service mesh provisioning, environment validation, secret
# generation, container building, and health checks for server deployment.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}======================================================================${RESET}"
echo -e "${BOLD}${CYAN}  🚀 Deploying Micropro Commute - Production Service Mesh  ${RESET}"
echo -e "${BOLD}${CYAN}======================================================================${RESET}"

# 1. Check prerequisites
echo -e "\n${BOLD}[1/6] Checking system prerequisites...${RESET}"

if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker Engine first:${RESET}"
    echo "   https://docs.docker.com/engine/install/"
    exit 1
fi

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}❌ Neither 'docker compose' nor 'docker-compose' was found.${RESET}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed:${RESET} $(docker --version)"
echo -e "${GREEN}✓ Compose is installed:${RESET} $($DOCKER_COMPOSE_CMD version)"

# Check if docker daemon is reachable
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running or accessible. Try: sudo systemctl start docker${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ Docker daemon is active and responding.${RESET}"

# 2. Environment Configuration
echo -e "\n${BOLD}[2/6] Verifying environment configuration (.env)...${RESET}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from .env.example with secure generated secrets...${RESET}"
    
    # Generate cryptographic random tokens
    GEN_JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
    GEN_REFRESH_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
    GEN_PG_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null || openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    
    # Detect host IP
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
    [ -z "$DETECTED_IP" ] && DETECTED_IP="127.0.0.1"

    cat <<EOF > .env
PROJECT_NAME="Micropro Commute Studio"
ENVIRONMENT="production"

# PostgreSQL Configuration
POSTGRES_SERVER=postgres
POSTGRES_USER=teams_user
POSTGRES_PASSWORD=${GEN_PG_PASSWORD}
POSTGRES_DB=teams_db
POSTGRES_PORT=5432
DATABASE_URL=postgresql+asyncpg://teams_user:${GEN_PG_PASSWORD}@postgres:5432/teams_db

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379/0

# Authentication Secrets
JWT_SECRET=${GEN_JWT_SECRET}
JWT_REFRESH_SECRET=${GEN_REFRESH_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# Mediasoup SFU WebRTC Announced IP
SFU_ANNOUNCED_IP=${DETECTED_IP}

# MinIO / S3 Object Storage
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=teams-uploads
S3_REGION=us-east-1

# Nginx
PORT=80
EOF

    echo -e "${GREEN}✓ Generated secure production .env with random secrets.${RESET}"
else
    echo -e "${GREEN}✓ Existing .env file found.${RESET}"
    
    # Ensure required secrets are populated
    if ! grep -q "JWT_SECRET=" .env || grep -q "CHANGE_ME" .env; then
        echo -e "${YELLOW}⚠️  Updating default/empty JWT secrets in .env...${RESET}"
        NEW_JWT=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -hex 32)
        NEW_REFRESH=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))" 2>/dev/null || openssl rand -hex 32)
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|g" .env
        sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${NEW_REFRESH}|g" .env
    fi
fi

# 3. Create persistent directories
echo -e "\n${BOLD}[3/6] Ensuring upload directories exist...${RESET}"
mkdir -p backend/uploads
chmod 777 backend/uploads 2>/dev/null || true
echo -e "${GREEN}✓ Persistent directories ready.${RESET}"

# 4. Build Containers
echo -e "\n${BOLD}[4/6] Building production Docker images...${RESET}"
echo -e "${CYAN}Building frontend (Vite React + Nginx), backend (FastAPI), and SFU (Mediasoup)...${RESET}"
$DOCKER_COMPOSE_CMD build --parallel

# 5. Start Service Mesh
echo -e "\n${BOLD}[5/6] Starting container stack in detached mode...${RESET}"
$DOCKER_COMPOSE_CMD up -d

# 6. Healthcheck Verification Probe
echo -e "\n${BOLD}[6/6] Verifying system health and connectivity...${RESET}"
echo "Waiting for services to become healthy..."

MAX_RETRIES=30
RETRY_COUNT=0
HEALTHY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/v1/health 2>/dev/null || true)
    if [ "$HTTP_CODE" = "200" ]; then
        HEALTHY=1
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done
echo ""

DETECTED_HOST=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
[ -z "$DETECTED_HOST" ] && DETECTED_HOST="localhost"

if [ $HEALTHY -eq 1 ]; then
    echo -e "${GREEN}${BOLD}🎉 Micropro Commute is LIVE and healthy!${RESET}"
    echo -e "${CYAN}----------------------------------------------------------------------${RESET}"
    echo -e "${BOLD}Access URLs:${RESET}"
    echo -e "  🌐 Web App:         ${BOLD}http://${DETECTED_HOST}${RESET} or http://localhost"
    echo -e "  🔌 API Endpoint:    ${BOLD}http://${DETECTED_HOST}/api/v1${RESET}"
    echo -e "  ⚡ WebSocket:       ${BOLD}ws://${DETECTED_HOST}/api/v1/ws${RESET}"
    echo -e "  📹 SFU Signaling:   ${BOLD}http://${DETECTED_HOST}:3010${RESET} (or /sfu/)"
    echo -e "  📦 MinIO Console:   ${BOLD}http://${DETECTED_HOST}:9001${RESET} (minioadmin / minioadmin)"
    echo -e "${CYAN}----------------------------------------------------------------------${RESET}"
    echo -e "${BOLD}Demo / Default Logins:${RESET}"
    echo -e "  👑 Admin:           ${BOLD}alex@acme.com${RESET} / password: ${BOLD}password123${RESET}"
    echo -e "  👤 Member:          ${BOLD}sarah@acme.com${RESET} / password: ${BOLD}password123${RESET}"
    echo -e "  👤 Member:          ${BOLD}mike@acme.com${RESET} / password: ${BOLD}password123${RESET}"
    echo -e "${CYAN}----------------------------------------------------------------------${RESET}"
    echo -e "${BOLD}Useful Commands:${RESET}"
    echo -e "  View live logs:     ${CYAN}$DOCKER_COMPOSE_CMD logs -f${RESET}"
    echo -e "  View service status:${CYAN}$DOCKER_COMPOSE_CMD ps${RESET}"
    echo -e "  Restart stack:      ${CYAN}$DOCKER_COMPOSE_CMD restart${RESET}"
    echo -e "  Stop stack:         ${CYAN}$DOCKER_COMPOSE_CMD down${RESET}"
    echo -e "${CYAN}======================================================================${RESET}"
else
    echo -e "${YELLOW}⚠️  Services started, but healthcheck timed out after 60s.${RESET}"
    echo -e "Check logs for details: ${CYAN}$DOCKER_COMPOSE_CMD logs backend${RESET}"
    $DOCKER_COMPOSE_CMD ps
fi
