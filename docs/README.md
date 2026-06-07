# ShiftMatrix Backend

> Payload CMS–based scheduling and workforce management API with a Python CP-SAT solver microservice.

---

## Table of Contents

| Document | Description |
|---|---|
| [architecture.md](./architecture.md) | DDD layered architecture, dependency rules |
| [api-reference.md](./api-reference.md) | All endpoint contracts with request/response examples |
| [services.md](./services.md) | Every exported service function, signatures, usage |
| [collections.md](./collections.md) | Payload CMS collection schemas, access control, relationships |
| [auto-fill-solver.md](./auto-fill-solver.md) | Full auto-fill flow, CP-SAT constraints, Python solver |
| [geofencing-attendance.md](./geofencing-attendance.md) | Haversine, geofence evaluation, clock-in grace period |
| [real-time-notifications.md](./real-time-notifications.md) | SSE architecture, NotificationBus, frontend usage |
| [access-control.md](./access-control.md) | Tenant isolation, access policies, workerOwnsViaField |
| [testing-guide.md](./testing-guide.md) | Running TS + Python tests, adding new tests |
| [environment-setup.md](./environment-setup.md) | Prerequisites, env vars, local setup, troubleshooting |

---

## Overview

ShiftMatrix Backend is a **Node.js + TypeScript** application built on [Payload CMS](https://payloadcms.com/) (v2), providing:

- **Multi-tenant** healthcare staff scheduling
- **CP-SAT constraint solver** (Python/OR-Tools) for automated shift filling
- **Real-time SSE notifications** for ward managers and workers
- **Geofence-validated clock-in** with haversine distance checking
- **Role-based access control** with per-tenant data isolation

The solver runs as a separate **Python Docker microservice** that communicates with the Node backend via a **Redis job queue** and a **HMAC-signed webhook**.

---

## Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Runtime | Node.js | ≥ 18 LTS |
| Language | TypeScript | strict mode |
| CMS / ORM | Payload CMS | v2 (REST + Local API) |
| Database | PostgreSQL | v15+ via `@payloadcms/db-postgres` |
| Queue | Redis | v7+ (ioredis client) |
| Solver | Python + OR-Tools | 3.11, CP-SAT model |
| Solver transport | Redis BRPOP → HMAC webhook | — |
| Real-time | Server-Sent Events (SSE) | Node EventEmitter bus |
| Container | Docker / docker-compose | solver_service only |
| Testing | Jest + ts-jest | TypeScript integration tests |

---

## Directory Structure

```
backend/
├── docs/                        ← You are here
├── src/
│   ├── access/
│   │   └── tenant.ts            # Multi-tenant access policy helpers
│   │
│   ├── collections/             # Payload CMS schema definitions ONLY
│   │   ├── Certifications.ts    # Cert master list (name, abbreviation)
│   │   ├── Media.ts             # Payload built-in media uploads
│   │   ├── Notifications.ts     # afterChange hook → NotificationService
│   │   ├── SchedulingRuns.ts    # Job tracking table (jobId, status)
│   │   ├── Shifts.ts            # Shift blocks, staffing requirements
│   │   ├── Tenants.ts           # Tenant settings (maxWeeklyHours, etc.)
│   │   ├── TimeLogs.ts          # Clock-in/out events, geofence results
│   │   ├── Unavailabilities.ts  # Worker unavailability requests
│   │   ├── Users.ts             # Staff accounts, roles, certifications
│   │   └── Wards.ts             # Ward info + geolocation for geofencing
│   │
│   ├── endpoints/               # Thin HTTP controllers (no business logic)
│   │   ├── autoFillEndpoint.ts  # POST /api/auto-fill
│   │   ├── clockInEndpoint.ts   # POST /api/time-logs/clock-in
│   │   ├── notificationsStream.ts # GET /api/notifications/stream (SSE)
│   │   └── solverWebhook.ts     # POST /api/shifts/solver-webhook
│   │
│   ├── engines/                 # ⚠️ DEPRECATED – do not import
│   │   ├── DEPRECATED.md        # Migration notes
│   │   ├── autoFillEngine.ts    # Superseded by SchedulingService
│   │   └── rulesEngine.ts       # Superseded by solver.py constraints
│   │
│   ├── infrastructure/          # I/O adapters (external systems)
│   │   ├── QueueService.ts      # Lazy ioredis singleton → enqueueJob()
│   │   └── NotificationBus.ts   # Global EventEmitter for SSE fanout
│   │
│   ├── services/                # All domain business logic
│   │   ├── AttendanceService.ts    # Geofence + clock-in evaluation
│   │   ├── NotificationService.ts  # Dispatch notifications (SSE + future SMS)
│   │   ├── SchedulingService.ts    # Orchestrate auto-fill job enqueueing
│   │   └── SolverPayloadBuilder.ts # Pure fns: build solver JSON payload
│   │
│   ├── solver_service/          # Python microservice (Docker)
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   ├── requirements.txt     # ortools, redis, requests
│   │   ├── solver.py            # CP-SAT model
│   │   ├── worker.py            # Redis BRPOP consumer
│   │   └── test_solver.py       # 4 unittest cases
│   │
│   ├── payload-types.ts         # Auto-generated Payload type definitions
│   └── payload.config.ts        # Payload CMS root configuration
│
├── tests/
│   └── int/                     # Integration test suite
│       ├── api.int.spec.ts
│       ├── collections.int.spec.ts
│       ├── clockIn.int.spec.ts
│       ├── notifications.int.spec.ts
│       └── autoFillAsync.int.spec.ts
├── package.json
└── tsconfig.json
```

---

## Quick-Start Commands

### Prerequisites

- Node.js ≥ 18, npm ≥ 9
- PostgreSQL 15 running locally (or via Docker)
- Redis 7 running locally (or via Docker)
- Docker Desktop (for the Python solver)

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — see docs/environment-setup.md
```

### 3. Start the backend (development)

```bash
npm run dev
# Payload CMS admin UI → http://localhost:3000/admin
# REST API         → http://localhost:3000/api
```

### 4. Start the Python solver microservice

```bash
docker compose -f src/solver_service/docker-compose.yml up --build
```

### 5. Run TypeScript integration tests

```bash
npm run test:int
```

### 6. Run Python solver unit tests

```bash
docker compose -f src/solver_service/docker-compose.yml run \
  -v $PWD/src/solver_service:/app solver \
  python -m unittest test_solver
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Payload CMS as ORM + admin | Rapid schema iteration, built-in auth, hooks system |
| Services layer with pure functions | Easy to unit test without DB or HTTP mocking |
| Separate Python solver microservice | OR-Tools CP-SAT is a mature constraint solver; Python ecosystem |
| Redis queue + HMAC webhook | Decouples long-running solver from HTTP request lifecycle |
| SSE over WebSockets | Simpler server-side; sufficient for one-directional notifications |
| Lazy Redis connection | Avoids `ECONNREFUSED` errors when Redis is not needed (e.g., test runs that don't enqueue) |

---

## Further Reading

See the [docs/](.) directory for detailed documentation on each subsystem.
