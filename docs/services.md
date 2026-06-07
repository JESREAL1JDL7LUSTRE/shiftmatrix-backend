# Services

All business logic lives in `src/services/`. Services are called by endpoints and collection hooks. They may call each other, the Payload Local API, or infrastructure adapters.

> **Rule:** Services must never import from `src/endpoints/`. Endpoints call services — not the other way around.

---

## SchedulingService.ts

**Purpose:** Orchestrates the full auto-fill scheduling workflow — from receiving the request context to pushing a job onto the Redis queue.

**Side effects:** Reads from PostgreSQL (5 queries), writes a `SchedulingRun` record, pushes to Redis.

### `enqueueSchedulingJob()`

```typescript
import { enqueueSchedulingJob } from '@/services/SchedulingService'

async function enqueueSchedulingJob(
  payload: Payload,
  options: {
    tenantId: string
    startDate: string  // ISO 8601 date string, e.g. "2025-02-03"
    endDate: string    // ISO 8601 date string, e.g. "2025-02-09"
  }
): Promise<string>  // Returns jobId UUID
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `payload` | `Payload` | The Payload CMS instance (from `req.payload` in endpoints) |
| `options.tenantId` | `string` | Payload document ID of the requesting tenant |
| `options.startDate` | `string` | ISO 8601 date — start of scheduling window |
| `options.endDate` | `string` | ISO 8601 date — end of scheduling window |

**Returns:** `Promise<string>` — the UUID `jobId` stored in the new `SchedulingRun` record.

**Internal flow:**

```
1. Query: fetch all shifts in [startDate, endDate] for tenantId
2. Query: fetch all workers (users with role='worker') for tenantId
3. Query: fetch all unavailabilities in range for tenantId
4. Query: fetch tenant settings (maxWeeklyHours, activateUnionRestRules)
5. Query: fetch scheduled shifts in prior 7 days (for current hours calculation)
6. buildWorkerCurrentHours(workerIds, priorShifts)         ← SolverPayloadBuilder
7. buildWorkerPayload(worker, unavailabilities, ...)  × N  ← SolverPayloadBuilder
8. buildSlotsForShift(shift)                          × N  ← SolverPayloadBuilder
9. payload.create({ collection: 'scheduling-runs', ... })  ← creates SchedulingRun
10. enqueueJob({ jobId, workers, slots, settings })         ← QueueService
11. return jobId
```

**When to call:** Called exclusively by `autoFillEndpoint.ts`. Do not call this function from collection hooks (it is too heavyweight).

**Example:**

```typescript
const jobId = await enqueueSchedulingJob(req.payload, {
  tenantId: req.user.tenantId,
  startDate: body.startDate,
  endDate: body.endDate,
})
res.status(202).json({ jobId, status: 'processing' })
```

---

## SolverPayloadBuilder.ts

**Purpose:** Pure utility functions that transform raw DB records into the typed JSON payload consumed by the Python solver. Zero DB calls, zero side effects — safe to call in unit tests without mocking.

### Types

```typescript
/** Represents a single worker's availability window within a slot */
interface UnavailabilityBlock {
  startMs: number  // Unix ms
  endMs: number    // Unix ms
}

/** Worker portion of the solver payload */
interface SolverWorkerPayload {
  workerId: string
  certifications: string[]       // abbreviations, e.g. ["RN", "BLS"]
  maxWeeklyHours: number         // from tenant settings or user override
  currentWeeklyHours: number     // already-scheduled hours this week
  unavailabilityBlocks: UnavailabilityBlock[]
}

/** A single schedulable slot — the TS↔Python contract */
interface SolverSlotPayload {
  shiftId: string
  blockIndex: number
  role: string
  requiredCerts: string[]        // cert abbreviations required for this slot
  startTime: string              // ISO 8601 — for Python datetime.fromisoformat()
  endTime: string                // ISO 8601
  startTimeMs: number            // Unix ms — for integer gap arithmetic in CP-SAT
  endTimeMs: number              // Unix ms
}

/** Top-level job payload pushed to Redis */
interface SolverJobPayload {
  jobId: string
  tenantId: string
  workers: SolverWorkerPayload[]
  slots: SolverSlotPayload[]
  settings: {
    defaultMaxWeeklyHours: number
    activateUnionRestRules: boolean
  }
}
```

### `buildWorkerCurrentHours()`

```typescript
function buildWorkerCurrentHours(
  workerIds: string[],
  scheduledShifts: Shift[]  // shifts from the prior 7 days
): Record<string, number>    // { workerId: hoursAlreadyScheduled }
```

Calculates how many hours each worker already has scheduled in the current week, based on shifts fetched from the DB. Used to enforce `maxWeeklyHours`.

**Pure:** No DB calls. Takes raw arrays, returns a plain object.

### `buildWorkerPayload()`

```typescript
function buildWorkerPayload(
  worker: User,
  unavailabilities: Unavailability[],
  currentHours: Record<string, number>,
  defaultMaxHours: number
): SolverWorkerPayload
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `worker` | `User` | Full Payload user document |
| `unavailabilities` | `Unavailability[]` | Approved unavailabilities for this worker in the scheduling window |
| `currentHours` | `Record<string, number>` | Output of `buildWorkerCurrentHours()` |
| `defaultMaxHours` | `number` | From tenant settings; used if worker has no personal override |

**Returns:** A `SolverWorkerPayload` ready to include in the Redis job payload.

**Pure:** No DB calls.

### `buildSlotsForShift()`

```typescript
function buildSlotsForShift(shift: Shift): SolverSlotPayload[]
```

Expands a single shift into one `SolverSlotPayload` per staffing requirement block. A shift with 3 requirement blocks (e.g., 2 RNs + 1 supervisor) produces 3 slot objects.

**Returns:** Array of `SolverSlotPayload[]` — one per staffing requirement.

**Key fields populated:**

- `startTime` / `endTime` — ISO 8601 strings from `shift.startTime` / `shift.endTime`
- `startTimeMs` / `endTimeMs` — `Date.parse(...)` for integer arithmetic in the CP-SAT model
- `requiredCerts` — flattened cert abbreviations from the block's requirements

**Pure:** No DB calls.

---

## AttendanceService.ts

**Purpose:** Geofence evaluation and clock-in validation. All three exported functions are pure — they take inputs and return outputs with no side effects.

### `haversineDistanceMeters()`

```typescript
function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number  // Distance in meters
```

Computes the great-circle distance between two geographic coordinates using the Haversine formula. Used internally by `evaluateGeofence()`.

**Example:**

```typescript
const dist = haversineDistanceMeters(14.5995, 120.9842, 14.6000, 120.9850)
// → ~120 (meters)
```

See [geofencing-attendance.md](./geofencing-attendance.md) for the full formula explanation.

### `evaluateGeofence()`

```typescript
type GeofenceStatus = 'within_bounds' | 'outside_bounds' | 'not_checked'

function evaluateGeofence(
  userLat: number,
  userLng: number,
  ward: Ward  // Payload Ward document with geolocation field
): GeofenceStatus
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `userLat` | `number` | Worker's reported latitude |
| `userLng` | `number` | Worker's reported longitude |
| `ward` | `Ward` | Ward document; must have `geolocation.lat`, `geolocation.lng`, `geolocation.radiusMeters` |

**Returns:**
- `'within_bounds'` — worker is within the ward's configured radius
- `'outside_bounds'` — worker is farther than the ward radius
- `'not_checked'` — ward has no geolocation configured

**Does NOT reject the clock-in** — returns a status that is stored on the `TimeLog` for supervisor review.

### `isClockInLate()`

```typescript
const GRACE_PERIOD_MS = 5 * 60 * 1000  // 5 minutes

function isClockInLate(
  nowMs: number,       // current time as Unix ms (Date.now())
  shiftStartMs: number // shift start time as Unix ms
): boolean
```

Returns `true` if the worker clocked in more than 5 minutes after the shift start time.

**Example:**

```typescript
const shiftStart = new Date('2025-02-03T08:00:00Z').getTime()
const clockInTime = new Date('2025-02-03T08:07:00Z').getTime()
isClockInLate(clockInTime, shiftStart)  // → true (7 min > 5 min grace)
```

---

## NotificationService.ts

**Purpose:** Centralized notification dispatch. Currently sends via SSE (real-time in-browser). The TODO is to add Twilio (SMS) and Resend (email) once API keys are provisioned.

### `dispatchNotification()`

```typescript
async function dispatchNotification(
  doc: Notification  // Payload Notification document (afterChange hook arg)
): Promise<void>
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `doc` | `Notification` | The freshly created or updated Notification document from Payload |

**What it does:**

1. Calls `emitNotification(doc)` from `NotificationBus` — triggers SSE push to all connected clients
2. Logs to console (placeholder for Twilio/Resend)

**When to call:** Called in the `afterChange` hook of the `Notifications` collection. Do not call this directly from endpoints.

**TODO — adding SMS/email:**

```typescript
// TODO: Replace console.log with real integrations when API keys are provisioned
// await twilioClient.messages.create({ to: user.phone, body: doc.message })
// await resend.emails.send({ to: user.email, subject: doc.message })
```

---

## How to Add a New Service

1. **Create the file** at `src/services/MyNewService.ts`

2. **Export named functions** (avoid default exports for tree-shaking):
   ```typescript
   export async function myServiceFunction(
     payload: Payload,
     options: MyOptions
   ): Promise<MyResult> {
     // business logic here
   }
   ```

3. **Keep pure functions separate** — if your service has helper calculations with no side effects, consider whether they belong in `SolverPayloadBuilder.ts` or a new pure utility file.

4. **Write a test** — see [testing-guide.md](./testing-guide.md) for the integration test pattern.

5. **Import from the endpoint:**
   ```typescript
   import { myServiceFunction } from '@/services/MyNewService'
   ```

6. **Never import from endpoints** — services must remain unaware of HTTP.
