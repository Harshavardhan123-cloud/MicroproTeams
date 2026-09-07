# MicroproTeams — Enterprise Collaboration Platform

MicroproTeams is a production-grade, enterprise collaboration and communication platform inspired by Microsoft Teams. Phase 1 provides the foundational architecture including authentication, multi-tenant organization support, team and channel management, dynamic RBAC authorization, and an enterprise dark/light theme React app shell.

---

## 🚀 Quick Start

### Option 1: Standalone Runner Scripts (Separate Terminal Execution)
- **Backend & SFU Services**:
```bash
./run-backend.sh
```
- **Frontend SPA**:
```bash
./run-frontend.sh
```

### Option 2: Full Unified Runner
Runs backend, seeds demo data, and launches frontend dev server:
```bash
./run-local.sh
```

### Option 2: Docker Compose (Production Service Mesh)
Launches PostgreSQL 16, Redis, MinIO S3 storage, FastAPI backend, React frontend, and Nginx proxy:
```bash
docker-compose up --build
```

---

## 🛠️ Access Points
- **Frontend SPA**: `http://localhost:3000` (or `http://localhost`)
- **FastAPI OpenAPI Docs**: `http://localhost:8000/docs`
- **FastAPI ReDoc**: `http://localhost:8000/redoc`

---

## 🔑 Development Seed Credentials
The platform automatically bootstraps the `Acme Corporation` demo workspace:

| Role | Email | Password | Username |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@example.com` | `password123` | `admin` |
| **User (Engineering)** | `alice@example.com` | `password123` | `alice` |
| **User (Product)** | `bob@example.com` | `password123` | `bob` |
| **User (DevOps)** | `charlie@example.com` | `password123` | `charlie` |

---

## 🧪 Testing

### Backend Test Suite (Pytest)
```bash
cd backend
PYTHONPATH=. ./venv/bin/pytest app/tests
```

### Frontend Type Check & Build
```bash
cd frontend
npm run build
```

---

## 🏛️ Architecture & Documentation
- [System Architecture](file:///home/hchatte/Desktop/MS/docs/architecture.md)
- [Database Schema & ERD](file:///home/hchatte/Desktop/MS/docs/database-erd.md)
