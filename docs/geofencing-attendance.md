# Geofencing & Attendance

ShiftMatrix validates clock-in/out events against a ward's configured geofence using the Haversine formula. All geofencing logic lives in `src/services/AttendanceService.ts` as pure functions.

---

## Overview

When a worker clocks in, the system:

1. Calculates the distance between the worker's GPS coordinates and the ward center
2. Compares the distance to the ward's configured `radiusMeters`
3. Records the result as `geofenceStatus` on the `TimeLog` document
4. Separately checks whether the clock-in is more than 5 minutes after shift start (`isLate`)

> **Important:** A geofence failure (worker is `outside_bounds`) does **not** reject the clock-in. The event is always recorded for supervisor review. Enforcement policy is a business decision outside the system's scope.

---

## Haversine Formula

The Haversine formula computes the great-circle distance between two points on a sphere given their latitudes and longitudes in decimal degrees.

### Why Haversine?

For short distances (< 10 km, typical for a hospital campus), Haversine gives < 0.1% error compared to more complex ellipsoidal models. It is computationally cheap and easy to audit.

### Implementation

```typescript
// src/services/AttendanceService.ts

const EARTH_RADIUS_M = 6_371_000  // Mean radius of Earth in meters

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}
```

### Formula breakdown

| Symbol | Meaning |
|---|---|
| `dLat` | Latitude difference in radians |
| `dLon` | Longitude difference in radians |
| `a` | Square of half the chord length |
| `c` | Angular distance in radians |
| `result` | Distance in meters (`EARTH_RADIUS_M × c`) |

### Example

```typescript
// Worker at Makati Medical Center entrance
const dist = haversineDistanceMeters(14.5641, 121.0184, 14.5640, 121.0183)
// → ~13.5 meters

const wardRadius = 100  // meters
console.log(dist < wardRadius)  // true → within_bounds
```

---

## `evaluateGeofence()`

```typescript
export type GeofenceStatus = 'within_bounds' | 'outside_bounds' | 'not_checked'

export function evaluateGeofence(
  userLat: number,
  userLng: number,
  ward: Ward
): GeofenceStatus
```

### Logic

```
IF ward.geolocation is null or incomplete
    RETURN 'not_checked'

distance = haversineDistanceMeters(userLat, userLng, ward.geolocation.lat, ward.geolocation.lng)

IF distance <= ward.geolocation.radiusMeters
    RETURN 'within_bounds'
ELSE
    RETURN 'outside_bounds'
```

### Return values

| Value | Meaning |
|---|---|
| `'within_bounds'` | Worker is within the ward's geofence circle |
| `'outside_bounds'` | Worker is outside the geofence — recorded for review |
| `'not_checked'` | Ward has no geolocation configured; check skipped |

### Configuring a Ward's Geofence

In the Payload Admin UI or via API, update the Ward document:

```json
{
  "geolocation": {
    "lat": 14.5641,
    "lng": 121.0184,
    "radiusMeters": 150
  }
}
```

A radius of 100–200 meters is typical for a hospital wing. Smaller values may cause false `outside_bounds` results due to GPS accuracy (~5–15m in open areas, worse indoors).

---

## `isClockInLate()`

```typescript
const GRACE_PERIOD_MS = 5 * 60 * 1000  // 5 minutes in milliseconds

export function isClockInLate(
  nowMs: number,       // current Unix timestamp in milliseconds
  shiftStartMs: number // shift start Unix timestamp in milliseconds
): boolean
```

Returns `true` if the worker's clock-in time is more than 5 minutes after the scheduled shift start.

### Logic

```typescript
return nowMs > shiftStartMs + GRACE_PERIOD_MS
```

### Examples

| Scenario | `nowMs - shiftStartMs` | Result |
|---|---|---|
| On time (0 min) | 0 ms | `false` |
| Within grace (3 min) | 180,000 ms | `false` |
| Exactly at grace (5 min) | 300,000 ms | `false` |
| Late (6 min) | 360,000 ms | `true` |
| Very late (1 hour) | 3,600,000 ms | `true` |

### Changing the Grace Period

The constant `GRACE_PERIOD_MS` is defined at the top of `AttendanceService.ts`. To change it (e.g., to 10 minutes), update the constant and all integration tests:

```typescript
const GRACE_PERIOD_MS = 10 * 60 * 1000  // 10 minutes
```

---

## Clock-In Event Types

The `eventType` field on a `TimeLog` document can be one of:

| Value | Meaning |
|---|---|
| `clock_in` | Worker arrives at shift start |
| `clock_out` | Worker leaves at shift end |
| `break_start` | Worker begins a break |
| `break_end` | Worker returns from break |

The `isLate` calculation applies only to `clock_in` events. The `clockInEndpoint.ts` evaluates lateness and geofence for all event types (geofence is always evaluated; `isLate` may be skipped for non-`clock_in` events depending on implementation).

---

## Full Clock-In Flow

```
POST /api/time-logs/clock-in
  { shiftId, lat, lng, eventType }
        │
        ▼
clockInEndpoint.ts
  1. Verify req.user is a worker
  2. Fetch shift by shiftId (get ward via populate)
  3. Fetch ward document
        │
        ▼
AttendanceService.evaluateGeofence(lat, lng, ward)
  → geofenceStatus: 'within_bounds' | 'outside_bounds' | 'not_checked'
        │
        ▼
AttendanceService.isClockInLate(Date.now(), shift.startTime.getTime())
  → isLate: boolean
        │
        ▼
payload.create({ collection: 'time-logs', data: {
  staffId: req.user.id,
  tenantId: req.user.tenantId,
  shiftId,
  eventType,
  timestamp: new Date(),
  geolocation: { lat, lng },
  geofenceStatus,
  isLate,
}})
        │
        ▼
201 { logId, geofenceStatus, isLate, message }
```

---

## How to Test Attendance

### Run the integration tests

```bash
npm run test:int -- --testPathPattern=clockIn
```

**`tests/int/clockIn.int.spec.ts`** covers 3 scenarios:

| Test | Description |
|---|---|
| Clock-in within geofence | Worker coordinates are within `radiusMeters` → `within_bounds`, `isLate: false` |
| Clock-in outside geofence | Worker coordinates exceed radius → `outside_bounds`, event still recorded |
| Late clock-in | Clock-in time > 5 min after shift start → `isLate: true` |

### Unit testing pure functions

Because `haversineDistanceMeters`, `evaluateGeofence`, and `isClockInLate` are pure, you can test them in isolation without any DB or server:

```typescript
import {
  haversineDistanceMeters,
  evaluateGeofence,
  isClockInLate,
} from '@/services/AttendanceService'

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceMeters(14.5, 121.0, 14.5, 121.0)).toBe(0)
  })

  it('calculates ~111km for 1 degree latitude', () => {
    const dist = haversineDistanceMeters(0, 0, 1, 0)
    expect(dist).toBeCloseTo(111_195, -2)  // within 100m
  })
})

describe('isClockInLate', () => {
  const shiftStart = new Date('2025-02-03T08:00:00Z').getTime()

  it('returns false within grace period', () => {
    const clockIn = shiftStart + 4 * 60 * 1000
    expect(isClockInLate(clockIn, shiftStart)).toBe(false)
  })

  it('returns true after grace period', () => {
    const clockIn = shiftStart + 6 * 60 * 1000
    expect(isClockInLate(clockIn, shiftStart)).toBe(true)
  })
})
```
