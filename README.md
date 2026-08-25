# 🚀 MicroproTeams

<div align="center">

![MicroproTeams Banner](public/logo.png)

**An AI-Powered Enterprise Communication & Real-time Collaboration Platform**

*Full-stack Microsoft Teams alternative built with Next.js, FastAPI, mediasoup WebRTC, Socket.io, and Ollama/Whisper AI.*

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](#-quick-start)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![mediasoup](https://img.shields.io/badge/mediasoup-WebRTC_SFU-FF6F00?style=for-the-badge&logo=webrtc&logoColor=white)](https://mediasoup.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

</div>

---

## 🌟 Key Features

### 💬 Enterprise Chat & Real-Time Collaboration
- **Channels & Direct Messages:** Organized public/private channels and direct messages with presence indicators.
- **Rich Text & Attachments:** Supports Markdown formatting, emojis, code blocks, and file uploads.
- **Real-Time Typing & Presence:** Live typing indicators and status updates (*Available*, *Busy*, *Do Not Disturb*, *Away*) via Socket.io.
- **End-to-End Encryption Scaffolding:** NaCl-backed E2E encryption for direct messages and critical channel content.

### 🎥 High-Performance HD Video Conferencing
- **mediasoup SFU Architecture:** Multi-party audio/video conferencing with low-latency WebRTC routing.
- **Interactive Controls:** Toggle Mic/Camera, Screen Sharing, Raise Hand, Reactions, and Live Captions.
- **Dynamic Video Grid:** Auto-layout grid scaling from 1 to 6+ participants with active-speaker highlighting.

### 🤖 AI Meeting Intelligence & Co-Pilot
- **Ollama Integration:** Local LLM integration (`llama3.1`) for automatic meeting summaries, key decisions, action items, and topic extraction.
- **Whisper Speech-to-Text:** Real-time live captions and automatic audio transcription.
- **AI Querying:** Interactively query meeting history and transcriptions directly from the meeting sidebar.

### 🔐 Enterprise Security & Infrastructure
- **Authentication:** JWT session management with Keycloak SSO integration.
- **Storage & Search:** MinIO object storage for file attachments and PostgreSQL (pgvector) + Redis for persistent caching and semantic search.
- **Nginx Reverse Proxy:** Unified routing with CORS management across frontend, REST API, and WebSocket endpoints.

---

## 🛠️ Technology Stack

| Domain | Technologies |
| --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Lucide Icons, Vanilla CSS Design System |
| **Backend API** | FastAPI, Python 3.12, SQLAlchemy (Async), Pydantic v2 |
| **Real-time & SFU** | Socket.io (ASGI), mediasoup (Node.js SFU Workers) |
| **Database & Cache** | PostgreSQL 16 (pgvector), Redis 7.4 |
| **Object Storage** | MinIO |
| **Auth & Identity** | Keycloak 25 |
| **AI / ML** | Ollama (`llama3.1`), Whisper |
| **Containerization** | Docker, Docker Compose, Nginx |

---

## 📦 Service Architecture & Ports

```
                          ┌─────────────────────────┐
                          │   Nginx Reverse Proxy   │
                          │      (Port 8088)        │
                          └────────────┬────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
┌───────▼────────┐             ┌───────▼────────┐             ┌───────▼────────┐
│ Next.js Web UI │             │  FastAPI API   │             │ WebSocket App  │
│  (Port 3001)   │             │  (Port 8000)   │             │  (Port 8001)   │
└────────────────┘             └───────┬────────┘             └────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
       ┌────────▼───────┐     ┌────────▼───────┐     ┌────────▼───────┐
       │ PostgreSQL DB  │     │  Redis Cache   │     │ MinIO Storage  │
       │  (Port 5432)   │     │  (Port 6379)   │     │ (Port 9000/01) │
       └────────────────┘     └────────────────┘     └────────────────┘
```

| Service | Port | Description |
| --- | --- | --- |
| **Frontend** | `3001` | Next.js Web Interface |
| **Nginx Proxy** | `8088` / `443` | Reverse Proxy & SSL Entrypoint |
| **FastAPI Backend** | `8000` | Core REST API & Business Logic |
| **WebSocket** | `8001` | Real-time messaging & presence server |
| **mediasoup SFU** | `3000` | WebRTC Media & Signaling Server |
| **PostgreSQL** | `5432` | Relational Database & Vector Storage |
| **Redis** | `6379` | In-memory Pub/Sub & Caching |
| **MinIO** | `9000` / `9001` | Object Storage & Media Files |
| **Keycloak** | `8080` | Identity & Access Management |

---

## ⚡ Quick Start (Docker Deployment)

### Prerequisites
- Docker (v24.0+) & Docker Compose (v2.20+)
- Node.js 20+ (for local frontend development)
- Python 3.12+ (for local backend development)

### 1. Clone the Repository
```bash
git clone https://github.com/Harshavardhan123-cloud/MicroproTeams.git
cd MicroproTeams
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
*(Optional)* Update `SERVER_IP` or `CORS_ORIGINS` in `.env` to match your local IP address for LAN access.

### 3. Launch Services via Docker Compose
Build and start all 11 microservices:
```bash
docker compose up -d --build
```

Verify service status:
```bash
docker compose ps
```

### 4. Access the Application
- **Web Client:** [http://localhost:3001](http://localhost:3001)
- **API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **MinIO Console:** [http://localhost:9001](http://localhost:9001)

---

## 🔑 Default Credentials

| Account | Email | Password | Role |
| --- | --- | --- | --- |
| **Standard User** | `hchatte@microproindia.com` | `password123` | Member |
| **Admin Account** | `admin@microproteams.com` | `password123` | Admin |
| **MinIO Admin** | `minioadmin` | `minioadmin_secret` | Superuser |

---

## 🧪 System Health Verification

Check backend API health:
```bash
curl http://localhost:8000/health
```

Check WebSocket service health:
```bash
curl http://localhost:8001/health
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <sub>Built with ❤️ for enterprise real-time collaboration</sub>
</div>
