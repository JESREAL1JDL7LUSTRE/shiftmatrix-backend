# Environment Setup

This guide covers all prerequisites, environment variables, and step-by-step instructions for running ShiftMatrix Backend locally.

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 18 LTS | TypeScript runtime |
| npm | 9+ | Package management |
| PostgreSQL | 15 | Primary database (Payload CMS ORM) |
| Redis | 7 | Job queue (solver) + optional caching |
| Docker Desktop | Latest | Running the Python solver microservice |
| Python | 3.11 (in Docker) | Solver only — not required on host |

### Installing Prerequisites

**macOS (Homebrew):**
```bash
brew install node postgresql@15 redis
brew install --cask docker
```

**Ubuntu/Debian:**
```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15

# Redis
sudo apt-get install -y redis-server

# Docker: https://docs.docker.com/engine/install/ubuntu/
```

**Windows:**
- Install [Node.js 18 LTS](https://nodejs.org/)
- Install [PostgreSQL 15](https://www.postgresql.org/download/windows/)
- Install [Redis for Windows](https://github.com/tporadowski/redis/releases) (or run via Docker)
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Environment Variables

Create a `.env` file in the `backend/` directory. Copy from `.env.example` if it exists:

```bash
cp .env.example .env
```

### All Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/shiftmatrix` | Yes | PostgreSQL connection string for Payload CMS |
| `PAYLOAD_SECRET` | `fallback-secret-key-1234` | Yes | JWT signing secret — **change in production** |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | No* | Redis connection for `QueueService.ts` and `worker.py` |
| `WORKER_SECRET` | `` (empty) | No | HMAC key for solver webhook auth — empty = skip verification (dev only) |
| `WEBHOOK_URL` | `http://localhost:3000/api/shifts/solver-webhook` | No | URL the Python solver POSTs results to |

*If `REDIS_URL` is not set, the backend starts fine. The Redis client only connects on the first `enqueueJob()` call (lazy initialization). Auto-fill will fail if Redis is unreachable when triggered.

### Example `.env` for Local Development

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/shiftmatrix_dev

# Payload CMS
PAYLOAD_SECRET=my-local-dev-secret-change-in-production

# Redis (if running locally)
REDIS_URL=redis://127.0.0.1:6379/0

# Solver webhook (used by worker.py)
WORKER_SECRET=
WEBHOOK_URL=http://localhost:3000/api/shifts/solver-webhook
```

### Production Considerations

| Variable | Production Guidance |
|---|---|
| `PAYLOAD_SECRET` | Use a random 64-character string. Generate with: `openssl rand -hex 32` |
| `WORKER_SECRET` | Set to a strong random secret — enables HMAC verification of solver callbacks |
| `DATABASE_URL` | Use a managed PostgreSQL service (Supabase, RDS, Neon) with SSL |
| `REDIS_URL` | Use a managed Redis (Upstash, Elasticache) with TLS: `rediss://...` |
| `WEBHOOK_URL` | Set to your production domain: `https://yourapp.com/api/shifts/solver-webhook` |

---

## Step-by-Step Local Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd ShiftMatrix/backend
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Create and configure the database

```bash
# Start PostgreSQL (if not already running)
# macOS: brew services start postgresql@15
# Ubuntu: sudo systemctl start postgresql

# Create the database
createdb shiftmatrix_dev

# Or using psql:
psql -U postgres -c "CREATE DATABASE shiftmatrix_dev;"
```

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your local settings
```

### 5. Start Redis (for the job queue)

```bash
# macOS: brew services start redis
# Ubuntu: sudo systemctl start redis-server
# Windows: redis-server (or run via Docker)

# Verify Redis is running:
redis-cli ping
# → PONG
```

### 6. Start the backend in development mode

```bash
npm run dev
```

Payload CMS will:
1. Connect to PostgreSQL
2. Sync the database schema (create tables if they don't exist)
3. Start the HTTP server on `http://localhost:3000`

**Admin UI:** `http://localhost:3000/admin`

On first run, Payload will prompt you to create the first admin user via the Admin UI.

### 7. Start the Python solver microservice (optional — needed for auto-fill)

```bash
docker compose -f src/solver_service/docker-compose.yml up --build
```

This starts two Docker containers:
- `redis` — Redis 7 instance (the solver's local Redis; separate from your host Redis if configured)
- `solver` — Python worker that consumes jobs from the queue

> **Note:** The Docker `redis` service runs on port `6379`. If you already have Redis running on port `6379` locally, the Docker Redis will conflict. Either stop your local Redis before starting Docker, or change the Docker Redis port mapping in `docker-compose.yml`.

---

## Docker Compose Explanation

**File:** `src/solver_service/docker-compose.yml`

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  solver:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      REDIS_URL: redis://redis:6379/0
      WEBHOOK_URL: http://host.docker.internal:3000/api/shifts/solver-webhook
      WORKER_SECRET: ${WORKER_SECRET:-}
    depends_on:
      - redis
    volumes:
      - .:/app
```

| Setting | Explanation |
|---|---|
| `redis://redis:6379/0` | The solver container uses the `redis` service by Docker DNS hostname |
| `host.docker.internal` | Resolves to the host machine from inside Docker (Mac/Windows). On Linux, use `172.17.0.1` |
| `WORKER_SECRET: ${WORKER_SECRET:-}` | Passes the `WORKER_SECRET` from your host `.env` into the container (empty by default) |
| `volumes: .:/app` | Live-mounts the solver source code for development iteration |

**Dockerfile:**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONPATH=/app
CMD ["python", "worker.py"]
```

---

## Common Troubleshooting

### ECONNREFUSED on Redis

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:6379` appears in backend logs.

**Cause:** Redis is not running, or the connection URL is wrong.

**Fix:**
```bash
# Check if Redis is running
redis-cli ping

# If not running:
brew services start redis   # macOS
sudo systemctl start redis  # Linux
```

If you don't need the auto-fill feature, this error is harmless — the Redis client only connects on first use (lazy init). The error in stderr was a known issue that was fixed by making the connection lazy.

---

### ECONNREFUSED on Redis (Docker solver)

**Symptom:** The Python solver container fails to connect to Redis.

**Cause:** The `redis` container is not ready before the `solver` container starts.

**Fix:** The `depends_on: redis` configuration waits for the container to start but not for Redis to be ready. Add a startup delay or health check:

```bash
# Restart the solver after Redis is healthy:
docker compose -f src/solver_service/docker-compose.yml restart solver
```

---

### PostgreSQL schema sync errors on startup

**Symptom:** Payload CMS logs errors like `relation "users" does not exist` or `column "tenantId" does not exist`.

**Cause:** The database schema is out of sync with the collection definitions.

**Fix:**
```bash
# Run Payload migrations (if using migration-based workflow):
npm run payload migrate

# Or for development, drop and recreate the DB:
dropdb shiftmatrix_dev && createdb shiftmatrix_dev
npm run dev  # Payload will recreate all tables
```

---

### `PAYLOAD_SECRET` warnings

**Symptom:** Console warning `Using default fallback PAYLOAD_SECRET`.

**Cause:** The `PAYLOAD_SECRET` env var is not set.

**Fix:** Set a real secret in `.env`. In development, any string works. In production, use a cryptographically random value:
```bash
openssl rand -hex 32
```

---

### Port 3000 already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Fix:**
```bash
# Find and kill the process using port 3000
lsof -ti tcp:3000 | xargs kill   # macOS/Linux
netstat -ano | findstr :3000      # Windows (then taskkill /PID <pid> /F)
```

---

### Docker solver cannot reach the backend webhook

**Symptom:** `solver` logs show `Connection refused` when POSTing to `WEBHOOK_URL`.

**Cause:** `host.docker.internal` is not supported on older versions of Docker or Linux without extra configuration.

**Fix for Linux:**
```bash
# Add to docker-compose.yml under solver service:
extra_hosts:
  - "host.docker.internal:host-gateway"
```

---

## Verifying the Setup

After completing setup, verify each component:

```bash
# Backend health
curl http://localhost:3000/api
# → {"message":"Welcome to the ShiftMatrix API"}

# PostgreSQL: log in to Payload admin UI
open http://localhost:3000/admin

# Redis
redis-cli ping
# → PONG

# Solver (check Docker logs)
docker compose -f src/solver_service/docker-compose.yml logs solver
# → Waiting for jobs on shift_solver_queue...
```
