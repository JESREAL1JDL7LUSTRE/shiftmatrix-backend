/**
 * clockInEndpoint — Thin Controller
 *
 * Validates input and user auth, then delegates geo-fencing and late-check
 * math to AttendanceService. No business logic lives here.
 */
import type { Endpoint } from 'payload'
import { evaluateGeofence, isClockInLate } from '../services/AttendanceService'

export const clockInEndpoint: Endpoint = {
  path: '/time-logs/clock-in',
  method: 'post',
  handler: async (req) => {
    let body: any
    try {
      body = await req.json?.()
    } catch {
      body = req.body || {}
    }

    const { shiftId, lat, lng, eventType } = body

    if (!shiftId || lat === undefined || lng === undefined || !eventType) {
      return Response.json(
        { error: 'shiftId, lat, lng, and eventType required' },
        { status: 400 }
      )
    }

    if (!req.user || req.user.role !== 'worker') {
      return Response.json({ error: 'Unauthorized. Only workers can clock in.' }, { status: 401 })
    }

    const workerId = req.user.id
    const tenantId =
      typeof req.user.tenantId === 'object'
        ? (req.user.tenantId as any)?.id
        : req.user.tenantId

    // Fetch shift + associated ward
    const shiftRes = await req.payload.findByID({
      collection: 'shifts',
      id: shiftId,
      depth: 1,
    })

    if (!shiftRes) {
      return Response.json({ error: 'Shift not found' }, { status: 404 })
    }

    const ward = shiftRes.ward as any
    const now = new Date()

    // Delegate math to AttendanceService (pure functions)
    const geofenceStatus = evaluateGeofence(lat, lng, ward)
    const isLate =
      eventType === 'clock_in'
        ? isClockInLate(now.getTime(), new Date(shiftRes.startTime).getTime())
        : false

    const newLog = await req.payload.create({
      collection: 'timeLogs',
      data: {
        staffId: workerId,
        tenantId,
        shiftId,
        eventType,
        timestamp: now.toISOString(),
        geolocation: { lat, lng },
        geofenceStatus,
        isLate,
      },
    })

    return Response.json(
      { message: 'Time log recorded successfully', geofenceStatus, isLate, logId: newLog.id },
      { status: 201 }
    )
  },
}
