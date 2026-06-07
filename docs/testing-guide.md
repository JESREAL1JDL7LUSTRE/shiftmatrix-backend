# Testing Guide

ShiftMatrix has two test suites:
- **TypeScript integration tests** (Jest + ts-jest) — test HTTP endpoints, DB operations, and event bus
- **Python unit tests** (unittest) — test CP-SAT solver constraint logic

---

## TypeScript Integration Tests

### Setup

Integration tests run against a **real PostgreSQL database** and a **real Payload CMS instance**. There is no mocking of the database layer.

**Prerequisites:**
- PostgreSQL running and accessible via `DATABASE_URL`
- Redis running (or `REDIS_URL` unset — queue tests are skipped gracefully)
- `.env.test` or environment variables configured

**Run all integration tests:**

```bash
# From backend/
npm run test:int
```

**Run a specific test file:**

```bash
npm run test:int -- --testPathPattern=clockIn
npm run test:int -- --testPathPattern=notifications
npm run test:int -- --testPathPattern=autoFillAsync
```

**Run with verbose output:**

```bash
npm run test:int -- --verbose
```

---

## Test File Reference

### `tests/int/api.int.spec.ts`

**Purpose:** Payload CMS health check — verifies the server starts and responds.

**What it tests:**
- `GET /api` returns a 200 response
- Basic Payload CMS configuration is valid

**When to run:** After any change to `payload.config.ts` or global middleware.

---

### `tests/int/collections.int.spec.ts`

**Purpose:** Tenant isolation and data seeding — verifies that RLS (row-level security) policies prevent cross-tenant data leakage.

**What it tests:**
- Creating tenants, users, and collection documents
- Verifying that a user from Tenant A cannot read documents from Tenant B
- Admin users can read all documents within their own tenant

**When to run:** After adding a new collection or modifying access control policies in `tenant.ts`.

**Pattern used:** Each test creates isolated tenants and cleans up after itself.

---

### `tests/int/clockIn.int.spec.ts`

**Purpose:** Geofence evaluation and isLate logic over HTTP.

**What it tests (3 tests):**

| Test | Setup | Assertion |
|---|---|---|
| Clock-in within geofence | Worker coords within ward radius | `geofenceStatus: 'within_bounds'`, `isLate: false` |
| Clock-in outside geofence | Worker coords > ward radius | `geofenceStatus: 'outside_bounds'`, event still created (201) |
| Late clock-in | Shift start 10 min ago | `isLate: true` |

**When to run:** After modifying `AttendanceService.ts`, `clockInEndpoint.ts`, or `TimeLogs` collection.

---

### `tests/int/notifications.int.spec.ts`

**Purpose:** SSE emitter via `NotificationBus`.

**What it tests:**
- Creating a `Notification` document triggers the `afterChange` hook
- The hook calls `dispatchNotification()`
- `dispatchNotification()` emits on `notificationBus`
- A listener on `notificationBus` receives the correct notification document

**When to run:** After modifying `NotificationService.ts`, `NotificationBus.ts`, or the `Notifications` collection hooks.

**Pattern:** The test does not open an actual HTTP SSE connection; it registers a listener directly on the `notificationBus` EventEmitter.

---

### `tests/int/autoFillAsync.int.spec.ts`

**Purpose:** Producer 202 response + webhook consumer flow.

**What it tests:**

1. **Producer:** `POST /api/auto-fill` returns `202` with a valid `jobId` UUID
2. **Consumer:** `POST /api/shifts/solver-webhook` with a mock success payload updates the `SchedulingRun` to `completed` and assigns workers to shifts

**When to run:** After modifying `autoFillEndpoint.ts`, `SchedulingService.ts`, `solverWebhook.ts`, or `QueueService.ts`.

**Note:** This test does NOT start the Python solver. It simulates the webhook callback directly, testing the TypeScript side of the integration.

---

## Python Solver Unit Tests

**File:** `src/solver_service/test_solver.py`

**Runner:** Python `unittest` module inside Docker.

**Run command:**

```bash
docker compose -f src/solver_service/docker-compose.yml run \
  -v $PWD/src/solver_service:/app solver \
  python -m unittest test_solver
```

**What it tests (4 cases):**

| Test class / method | What it verifies |
|---|---|
| `TestSolverBasic.test_simple_assignment` | 1 worker, 1 slot, matching cert → assignment returned |
| `TestSolverCerts.test_cert_mismatch` | Worker without required cert → slot unassigned or INFEASIBLE |
| `TestSolverUnavailability.test_unavailability_blocks` | Worker unavailability overlapping slot → excluded from assignment |
| `TestSolverInfeasible.test_infeasible` | No valid assignment possible → `{ success: false, reason: 'infeasible_constraints' }` |

**When to run:** After modifying `solver.py` constraints.

---

## How to Add a New Integration Test

### 1. Create the test file

```bash
# Name pattern: tests/int/<feature>.int.spec.ts
touch tests/int/myFeature.int.spec.ts
```

### 2. Use the standard test template

```typescript
import payload from 'payload'
import { getPayloadClient } from '../helpers/getPayloadClient'  // if available

let payloadClient: Payload

beforeAll(async () => {
  payloadClient = await getPayloadClient()
  // Seed test data
})

afterAll(async () => {
  // Clean up test data
  // await payloadClient.delete({ collection: 'my-collection', where: { ... } })
})

describe('My Feature', () => {
  it('should do the expected thing', async () => {
    const response = await fetch('http://localhost:3000/api/my-endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ field: 'value' }),
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.result).toBeDefined()
  })
})
```

### 3. Common test helpers

**Getting an admin JWT:**
```typescript
const loginRes = await fetch('http://localhost:3000/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@test.com', password: 'testpassword' }),
})
const { token } = await loginRes.json()
```

**Seeding a tenant:**
```typescript
const tenant = await payloadClient.create({
  collection: 'tenants',
  data: { name: 'Test Tenant', slug: `test-tenant-${Date.now()}` },
})
```

**Seeding a user:**
```typescript
const user = await payloadClient.create({
  collection: 'users',
  data: {
    email: `worker-${Date.now()}@test.com`,
    password: 'password',
    role: 'worker',
    tenantId: tenant.id,
  },
})
```

### 4. Add to the test pattern match (if needed)

By default, `npm run test:int` picks up all files matching `tests/int/*.int.spec.ts`. If you follow the naming convention, no configuration changes are needed.

---

## Common Test Patterns

### Testing access control (tenant isolation)

```typescript
it('worker cannot read another tenant\'s shifts', async () => {
  // Create Tenant A user, Tenant B data
  const tenantAToken = await loginAs(workerA)
  const tenantBShift = await createShift(tenantB)

  const res = await fetch(`http://localhost:3000/api/shifts/${tenantBShift.id}`, {
    headers: { Authorization: `Bearer ${tenantAToken}` },
  })

  expect(res.status).toBe(404)  // Payload returns 404 (not 403) for access-denied queries
})
```

### Testing async event bus

```typescript
it('notification dispatched after collection create', (done) => {
  notificationBus.once('new_notification', (doc) => {
    expect(doc.message).toBe('Test notification')
    done()
  })

  // Trigger the hook by creating a Notification document
  payload.create({ collection: 'notifications', data: { message: 'Test notification', ... } })
})
```

### Testing pure service functions (no HTTP)

```typescript
import { isClockInLate } from '@/services/AttendanceService'

it('isClockInLate returns true after 5-minute grace period', () => {
  const shiftStart = 1000000
  const sixMinutesLater = shiftStart + 6 * 60 * 1000
  expect(isClockInLate(sixMinutesLater, shiftStart)).toBe(true)
})
```

---

## Troubleshooting Tests

### `ECONNREFUSED` on Redis

Integration tests that don't exercise the queue may still fail if `QueueService.ts` initializes eagerly. This was fixed by making the Redis client lazy (only connects on first `enqueueJob()` call). If you see this error, check that no test imports `QueueService` directly without actually calling `enqueueJob()`.

### Tests polluting each other

Each test file should clean up all documents it creates in `afterAll()`. Use unique slugs/emails with `Date.now()` or a UUID to avoid conflicts between parallel test runs.

### Payload schema sync errors

If Payload detects schema drift between collections and the DB on startup during tests, run:

```bash
npm run payload migrate
```

Or drop and recreate the test database if you're in a dev environment.
