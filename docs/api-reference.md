# API Reference

All endpoints are registered on the Payload CMS server. Base URL in development: `http://localhost:3000`.

Standard auth: include a Payload JWT in the `Authorization: Bearer <token>` header, obtained by calling `POST /api/users/login`.

---

## Endpoints Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auto-fill` | Admin JWT | Enqueue an auto-fill scheduling job |
| `POST` | `/api/time-logs/clock-in` | Worker JWT | Record a clock-in/out event |
| `GET` | `/api/notifications/stream` | Any authenticated user | SSE stream for real-time notifications |
| `POST` | `/api/shifts/solver-webhook` | HMAC signature | Receive solver result from Python microservice |

---

## POST /api/auto-fill

**File:** `src/endpoints/autoFillEndpoint.ts`

Triggers the automated shift-filling process for a date range. Enqueues a job in Redis and returns immediately (asynchronous — HTTP 202).

### Authentication

Admin JWT required. The request user must have `role === 'admin'` or `role === 'superadmin'`.

```http
Authorization: Bearer <admin-jwt-token>
```

### Request

```http
POST /api/auto-fill
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**

```json
{
  "startDate": "2025-02-03",
  "endDate": "2025-02-09"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` (ISO 8601 date) | Yes | Start of the scheduling window (inclusive) |
| `endDate` | `string` (ISO 8601 date) | Yes | End of the scheduling window (inclusive) |

### Responses

#### 202 Accepted — Job enqueued

```json
{
  "jobId": "a3f7c2d1-0b4e-4f8a-9c1d-2e5b7a0f3c6d",
  "status": "processing",
  "message": "Scheduling job enqueued. Check SchedulingRuns for status."
}
```

| Field | Type | Description |
|---|---|---|
| `jobId` | `string` (UUID) | Unique identifier — query `SchedulingRuns` collection to poll status |
| `status` | `"processing"` | Always `"processing"` at this point |
| `message` | `string` | Human-readable confirmation |

#### 400 Bad Request — Missing parameters

```json
{
  "error": "startDate and endDate required"
}
```

#### 401 Unauthorized — Missing or invalid JWT

```json
{
  "error": "Unauthorized"
}
```

### Polling for Completion

After receiving a `jobId`, poll the Payload REST API to check job status:

```http
GET /api/scheduling-runs?where[jobId][equals]=<jobId>
Authorization: Bearer <token>
```

The `status` field will transition: `pending` → `completed` | `failed`.

---

## POST /api/time-logs/clock-in

**File:** `src/endpoints/clockInEndpoint.ts`

Records a clock-in or clock-out event for a worker. Evaluates geofence proximity to the ward and whether the event is late.

### Authentication

Worker JWT required. The request user must have `role === 'worker'`.

```http
Authorization: Bearer <worker-jwt-token>
```

### Request

```http
POST /api/time-logs/clock-in
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**

```json
{
  "shiftId": "64f2a1b3c4d5e6f7a8b9c0d1",
  "lat": 14.5995,
  "lng": 120.9842,
  "eventType": "clock_in"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `shiftId` | `string` | Yes | Payload document ID of the shift |
| `lat` | `number` | Yes | Worker's current latitude (decimal degrees) |
| `lng` | `number` | Yes | Worker's current longitude (decimal degrees) |
| `eventType` | `string` | Yes | One of: `clock_in`, `clock_out`, `break_start`, `break_end` |

### Responses

#### 201 Created — Event recorded

```json
{
  "logId": "64f2a1b3c4d5e6f7a8b9c0d2",
  "geofenceStatus": "within_bounds",
  "isLate": false,
  "message": "Clock-in recorded successfully."
}
```

| Field | Type | Description |
|---|---|---|
| `logId` | `string` | Payload document ID of the created TimeLog |
| `geofenceStatus` | `"within_bounds"` \| `"outside_bounds"` \| `"not_checked"` | Result of geofence evaluation |
| `isLate` | `boolean` | `true` if clock-in is more than 5 minutes after shift start |
| `message` | `string` | Human-readable result |

> **Note:** A geofenceStatus of `"outside_bounds"` does NOT reject the clock-in — it is recorded for supervisor review.

#### 400 Bad Request — Missing or invalid fields

```json
{
  "error": "shiftId, lat, lng, and eventType are required"
}
```

#### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

#### 404 Not Found — Shift not found

```json
{
  "error": "Shift not found"
}
```

---

## GET /api/notifications/stream

**File:** `src/endpoints/notificationsStream.ts`

Opens a persistent Server-Sent Events (SSE) connection. The server pushes notifications in real time as they are dispatched.

### Authentication

Any authenticated user (admin, worker, or superadmin).

```http
Authorization: Bearer <jwt-token>
```

### Request

```http
GET /api/notifications/stream
Accept: text/event-stream
Authorization: Bearer <token>
```

No request body or query parameters.

### Response

**Content-Type:** `text/event-stream`

The connection stays open indefinitely. The server sends three types of messages:

#### Connection confirmation (on connect)

```
data: {"type":"connected"}

```

#### Notification event (when a new notification is dispatched)

```
data: {"id":"64f2a1b3c4d5e6f7a8b9c0d3","message":"Shift A02 has been filled","type":"shift_alert","recipientId":"64f2a1b3c4d5e6f7a8b9c0d4","tenantId":"64f2a1b3c4d5e6f7a8b9c0d5","read":false,"createdAt":"2025-02-03T08:00:00.000Z"}

```

#### Heartbeat (every 15 seconds, keeps connection alive through proxies)

```
: heartbeat

```

### Client-Side Usage (Frontend)

```javascript
const evtSource = new EventSource('/api/notifications/stream', {
  // If using cookie-based auth, credentials are sent automatically.
  // If using Bearer token, you may need a custom fetch wrapper.
});

evtSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'connected') {
    console.log('SSE connected');
    return;
  }
  // data is a Notification document
  showToast(data.message);
};

evtSource.onerror = () => {
  console.warn('SSE connection lost — browser will auto-reconnect');
};
```

> See [real-time-notifications.md](./real-time-notifications.md) for the full architecture.

---

## POST /api/shifts/solver-webhook

**File:** `src/endpoints/solverWebhook.ts`

Receives the result of a scheduling job from the Python solver microservice. This endpoint is **not called by frontend clients** — it is called exclusively by `worker.py`.

### Authentication

HMAC-SHA256 signature verification. The solver signs the request body using the `WORKER_SECRET` environment variable and sends the signature in the `x-webhook-signature` header.

```http
x-webhook-signature: sha256=<hex-digest>
```

If `WORKER_SECRET` is empty (default), signature verification is **skipped** (development mode only).

### Request — Success case

```http
POST /api/shifts/solver-webhook
Content-Type: application/json
x-webhook-signature: sha256=abc123...
```

```json
{
  "success": true,
  "jobId": "a3f7c2d1-0b4e-4f8a-9c1d-2e5b7a0f3c6d",
  "assignments": [
    {
      "workerId": "64f2a1b3c4d5e6f7a8b9c0d6",
      "shiftId": "64f2a1b3c4d5e6f7a8b9c0d7",
      "blockIndex": 0
    },
    {
      "workerId": "64f2a1b3c4d5e6f7a8b9c0d8",
      "shiftId": "64f2a1b3c4d5e6f7a8b9c0d7",
      "blockIndex": 1
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `true` | Indicates a feasible solution was found |
| `jobId` | `string` | UUID matching the `SchedulingRun.jobId` |
| `assignments` | `array` | List of worker-to-shift-slot assignments |
| `assignments[].workerId` | `string` | Payload document ID of the assigned worker |
| `assignments[].shiftId` | `string` | Payload document ID of the shift |
| `assignments[].blockIndex` | `number` | Index into the shift's `staffingRequirements` blocks array |

### Request — Failure case

```json
{
  "success": false,
  "jobId": "a3f7c2d1-0b4e-4f8a-9c1d-2e5b7a0f3c6d",
  "reason": "infeasible_constraints"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `false` | No feasible solution found |
| `jobId` | `string` | UUID of the failed job |
| `reason` | `string` | `"infeasible_constraints"` or a free-form error string |

### Server Behavior

**On success:**
1. Updates `SchedulingRun.status` → `"completed"`
2. For each assignment: adds `workerId` to `shift.assignedStaff[blockIndex]`
3. When all required slots for a shift are filled: sets `shift.status` → `"filled"`

**On failure:**
1. Updates `SchedulingRun.status` → `"failed"`
2. Sets `SchedulingRun.errorReason` to the `reason` string

### Responses

#### 200 OK

```json
{ "ok": true }
```

#### 401 Unauthorized — Invalid HMAC signature

```json
{ "error": "Invalid signature" }
```

#### 404 Not Found — jobId not in SchedulingRuns

```json
{ "error": "SchedulingRun not found" }
```

#### 500 Internal Server Error

```json
{ "error": "Internal error updating assignments" }
```

---

## Standard Payload CMS REST Endpoints

In addition to custom endpoints, Payload CMS exposes standard CRUD REST APIs for all collections:

| Pattern | Description |
|---|---|
| `GET /api/{collection}` | List documents (with filtering, pagination) |
| `POST /api/{collection}` | Create a document |
| `GET /api/{collection}/{id}` | Get a single document |
| `PATCH /api/{collection}/{id}` | Update a document |
| `DELETE /api/{collection}/{id}` | Delete a document |
| `POST /api/users/login` | Obtain JWT token |
| `POST /api/users/logout` | Invalidate JWT token |
| `GET /api/users/me` | Get current user |

Collection slugs: `users`, `tenants`, `wards`, `shifts`, `time-logs`, `unavailabilities`, `scheduling-runs`, `notifications`, `certifications`.
