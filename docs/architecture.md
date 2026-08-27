# MicroproTeams — Phase 1 System Architecture Specification

## Overview
MicroproTeams is a production-grade enterprise collaboration platform inspired by Microsoft Teams. Phase 1 provides a robust, security-first foundation encompassing organization management, multi-tenant isolation, Role-Based Access Control (RBAC), authentication services, team management, and a Teams-style application shell.

---

## 1. Monorepo & Directory Architecture

```
/home/hchatte/Desktop/MS/
├── backend/
│   ├── alembic/              # Database migration scripts
│   ├── app/
│   │   ├── api/v1/          # FastAPI API routers (auth, teams, users)
│   │   ├── auth/            # Security & JWT utilities
│   │   ├── core/            # Config, DB connection, Redis, response helpers
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── permissions/     # Dynamic RBAC permission checkers
│   │   ├── repositories/    # Data access objects (DAO)
│   │   ├── schemas/         # Pydantic validation models
│   │   ├── services/        # Domain business logic & seeding
│   │   └── main.py          # FastAPI application entrypoint
│   ├── requirements.txt
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios client instance
│   │   ├── components/      # UI components & modals
│   │   ├── hooks/           # Custom React hooks
│   │   ├── layouts/         # App shell & layout components
│   │   ├── pages/           # Page routes (/login, /register, /app/teams, etc.)
│   │   ├── routes/          # React Router router definitions
│   │   ├── services/        # API service abstraction (auth, user, team)
│   │   ├── stores/          # Zustand state stores (authStore, uiStore)
│   │   ├── types/           # TypeScript interfaces & enums
│   │   └── utils/           # Helper functions & formatters
│   ├── package.json
│   └── vite.config.ts
├── docs/                    # Architectural & Database documentation
├── infrastructure/          # Nginx reverse proxy configuration
├── docker-compose.yml       # Production service orchestration
├── run-local.sh             # Zero-dependency local development runner
└── README.md                # Project README & quickstart guide
```

---

## 2. Component Architectures

### 2.1 Backend Architecture
- **Framework**: FastAPI (Python 3.10+) utilizing `async/await` throughout.
- **ORM & Database**: SQLAlchemy 2.0 Async (`asyncpg` for PostgreSQL, `aiosqlite` for embedded fallback).
- **Service & Repository Pattern**: API Routers -> Business Services -> Data Repositories -> SQLAlchemy Models.
- **API Envelope Standard**: All endpoints return standardized JSON responses:
  - **Success**: `{ "success": true, "data": { ... } }`
  - **Error**: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable error message" } }`

### 2.2 Frontend Architecture
- **Framework**: React 18 + Vite + TypeScript.
- **Styling**: Tailwind CSS with enterprise dark/light theme tokens.
- **Routing**: React Router DOM v6.
- **State Management**:
  - **Server State**: TanStack Query (`useQuery`, `useMutation`) for caching, prefetching, and automatic refetching.
  - **Client Application State**: Zustand (`useAuthStore`, `useUIStore`) for auth tokens, user info, active tab, and theme preference.
- **API Communication**: Isolated service modules (`authService`, `userService`, `teamService`) wrapping an `apiClient` Axios instance with interceptors for JWT injection and token refresh.

### 2.3 Authentication & Authorization Architecture
- **Stateless JWT**: Access Tokens (short-lived, 30m) and Refresh Tokens (long-lived, 7d).
- **Password Hashing**: Direct `bcrypt` algorithm.
- **Role-Based Access Control (RBAC)**:
  - **Roles**: `SUPER_ADMIN`, `ORG_ADMIN`, `USER`.
  - **Team Member Roles**: `OWNER`, `MEMBER`, `GUEST`.
  - **Permissions**: Granular codes (`organization.read`, `team.create`, `team.update`, `team.delete`, `channel.create`, etc.).
  - Enforcement is performed at the backend API layer via FastAPI Dependency `PermissionChecker`.

### 2.4 Redis Architecture
- Integrated reusable Redis service (`app/core/redis.py`) for session tracking, presence state, and caching.
- Includes automatic fallback to an in-memory storage dictionary when standalone Redis is offline.

### 2.5 Infrastructure & Docker Stack
- **PostgreSQL**: Relational storage (Port 5432).
- **Redis**: Caching & presence (Port 6379).
- **MinIO**: S3-compatible file storage (Ports 9000/9001).
- **Backend API**: FastAPI on Uvicorn (Port 8000).
- **Frontend App**: Vite React single-page application (Port 3000).
- **Nginx**: Reverse proxy (Port 80) routing `/api/v1` to FastAPI and `/` to Vite.
