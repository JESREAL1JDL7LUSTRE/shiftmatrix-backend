# Geo-Fencing & Attendance

To prevent time-theft and ensure accurate payroll, workers can only clock into their shifts if they are physically present at the facility.

## The Haversine Formula

When a worker attempts to clock in via the mobile portal, their device sends their current GPS coordinates (`latitude`, `longitude`) to the `POST /api/time-logs/clock-in` endpoint.

The backend uses the **Haversine formula** to calculate the great-circle distance between the user's phone and the assigned Ward's geolocation coordinates.

```typescript
// Haversine snippet
const R = 6371e3; // Earth radius in meters
const φ1 = lat1 * Math.PI/180;
const φ2 = lat2 * Math.PI/180;
const Δφ = (lat2-lat1) * Math.PI/180;
const Δλ = (lon2-lon1) * Math.PI/180;

const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
const distance = R * c;
```

If the calculated `distance` is greater than the ward's `radiusMeters` (default 500m), the clock-in is registered, but flagged on the frontend so managers can review it.

## Lateness Detection

When the user clocks in, the backend compares the current server timestamp against the `shift.startTime`.
If the user clocks in more than 0 milliseconds after the exact start time, the `TimeLogs` record is automatically flagged with `isLate: true`.
