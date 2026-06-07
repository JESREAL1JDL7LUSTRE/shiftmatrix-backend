/**
 * AttendanceService — Service Layer
 *
 * Pure business logic for the attendance / geo-fencing domain.
 * No Payload/DB calls — only receives data, performs math, returns results.
 * This makes every function trivially unit-testable without any mocking.
 */

// ─── Geo-fencing ──────────────────────────────────────────────────────────────

/**
 * Haversine formula — calculates great-circle distance between two
 * GPS coordinates in metres.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000 // Earth radius in metres
  const toRad = (deg: number) => deg * (Math.PI / 180)

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type GeofenceStatus = 'within_bounds' | 'outside_bounds' | 'not_checked'

/**
 * Determines whether GPS coordinates are within a ward's geofence.
 */
export function evaluateGeofence(
  userLat: number,
  userLng: number,
  ward: { geolocation?: { latitude?: number; longitude?: number; radiusMeters?: number } }
): GeofenceStatus {
  const geo = ward?.geolocation
  if (!geo?.latitude || !geo?.longitude) return 'not_checked'

  const radiusMeters = geo.radiusMeters ?? 100
  const distance = haversineDistanceMeters(userLat, userLng, geo.latitude, geo.longitude)
  return distance <= radiusMeters ? 'within_bounds' : 'outside_bounds'
}

// ─── Lateness Detection ───────────────────────────────────────────────────────

const LATE_GRACE_PERIOD_MS = 5 * 60_000 // 5-minute grace window

/**
 * Returns true if the clock-in timestamp is more than 5 minutes
 * past the shift's scheduled start time.
 */
export function isClockInLate(
  nowMs: number,
  shiftStartMs: number
): boolean {
  return nowMs > shiftStartMs + LATE_GRACE_PERIOD_MS
}
