# MicroproTeams — Enterprise Collaboration Platform

MicroproTeams is a production-grade, enterprise collaboration and communication platform inspired by Microsoft Teams. It provides an enterprise communication architecture including authentication, multi-tenant organization support, team and channel management, dynamic RBAC authorization, hierarchical organization structures, real-time messaging, WebRTC calling with Mediasoup SFU, file management, and a unified React SPA.

---

## 💻 Machine-Independent Setup & Run Guide

MicroproTeams is engineered to run seamlessly on **any machine** (Linux, macOS, Windows) with zero manual file modifications.

### 🐳 Method 1: Docker Compose (Zero Configuration, Any OS)
Runs the complete stack (PostgreSQL 16, Redis, MinIO S3 storage, FastAPI backend, SFU WebRTC, React frontend, and Nginx proxy) in isolated containers:
```bash
docker compose up --build
```
*(Or on older systems: `docker-compose up --build`)*

- Frontend SPA: `http://localhost` or `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`

---

### 🐧 / 🍎 Method 2: Linux & macOS (Native Bare-Metal)

#### Step 1: Run Initial Setup (First time only)
```bash
chmod +x setup.sh
./setup.sh
```
*This automatically checks Python 3.10+ and Node 18+, creates `.env` with secure random tokens, creates the virtual environment, installs backend/SFU/frontend dependencies, and seeds the database.*

#### Step 2: Launch Application
- **Run Everything (Unified)**:
  ```bash
  ./run-local.sh
  ```
- **Or Run Separately in Two Terminals**:
  ```bash
  # Terminal 1 (Backend & SFU Media Server):
  ./run-backend.sh

  # Terminal 2 (Frontend React + Vite):
  ./run-frontend.sh
  ```

---

### 🪟 Method 3: Windows (Native CMD or PowerShell)

#### Step 1: Run Initial Setup (First time only)
Double-click `setup.bat` or run in CMD:
```cmd
setup.bat
```

#### Step 2: Launch Application
- **Double-click `run-local.bat`** (or in PowerShell: `.\run-local.ps1`).
- Or run separately:
  ```cmd
  run-backend.bat
  run-frontend.bat
  ```

---

## 🛠️ Service Access Points

| Service | Address | Description |
| :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:3000` | Main collaborative user interface |
| **Nginx Reverse Proxy** | `http://localhost:80` | Production entry point (when using Docker) |
| **FastAPI REST API** | `http://localhost:8000/api/v1` | Backend REST endpoints |
| **Interactive API Docs** | `http://localhost:8000/docs` | Swagger OpenAPI documentation |
| **SFU WebRTC Node** | `http://localhost:3010` | Mediasoup audio/video signaling |

---

## 🔑 Demo Workspace Accounts

The platform automatically bootstraps the `Acme Corporation` demo workspace:

| Role | Email | Password | Username |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@example.com` | `password123` | `admin` |
| **User (Engineering)** | `alice@example.com` | `password123` | `alice` |
| **User (Product)** | `bob@example.com` | `password123` | `bob` |
| **User (DevOps)** | `charlie@example.com` | `password123` | `charlie` |

---

## 🧪 Automated Testing & Verification

### Backend Pytest Suite
```bash
cd backend
PYTHONPATH=. ./venv/bin/pytest app/tests
```

### Frontend Production Build Check
```bash
cd frontend
npm run build
```

---

## 🏛️ Documentation
- [System Architecture](./docs/architecture.md)
- [Database Schema & ERD](./docs/database-erd.md)
- [File Storage & Security](./docs/file-security.md)
