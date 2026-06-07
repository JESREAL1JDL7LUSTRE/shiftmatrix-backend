import { PayloadHandler, Endpoint } from 'payload'

// Haversine distance formula to calculate distance between two coordinates in meters
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export const clockInEndpoint: Endpoint = {
  path: '/time-logs/clock-in',
  method: 'post',
  handler: async (req) => {
    let body
    try {
      body = await req.json?.()
    } catch {
      body = req.body || {}
    }

    const { shiftId, lat, lng, eventType } = body

    if (!shiftId || lat === undefined || lng === undefined || !eventType) {
      return Response.json({ error: 'shiftId, lat, lng, and eventType required' }, { status: 400 })
    }

    if (!req.user || req.user.role !== 'worker') {
      return Response.json({ error: 'Unauthorized. Only workers can clock in.' }, { status: 401 })
    }

    const workerId = req.user.id
    const tenantId = typeof req.user.tenantId === 'object' ? req.user.tenantId?.id : req.user.tenantId

    // 1. Fetch the Shift and associated Ward
    const shiftRes = await req.payload.findByID({
      collection: 'shifts',
      id: shiftId,
      depth: 1 // Fetch ward details
    })

    if (!shiftRes) {
      return Response.json({ error: 'Shift not found' }, { status: 404 })
    }

    const ward = shiftRes.ward as any
    const shiftStartTime = new Date(shiftRes.startTime).getTime()
    const now = new Date()
    const nowMs = now.getTime()

    // 2. Geofence Check
    let geofenceStatus: 'within_bounds' | 'outside_bounds' | 'not_checked' = 'not_checked'
    if (ward?.geolocation?.latitude && ward?.geolocation?.longitude) {
      const radius = ward.geolocation.radiusMeters || 100
      const distance = getDistanceFromLatLonInM(lat, lng, ward.geolocation.latitude, ward.geolocation.longitude)
      geofenceStatus = distance <= radius ? 'within_bounds' : 'outside_bounds'
    }

    // 3. Late Check
    // If they are clocking in, and current time is > 5 minutes past shift start time
    let isLate = false
    if (eventType === 'clock_in' && nowMs > (shiftStartTime + 5 * 60000)) {
      isLate = true
    }

    // 4. Create TimeLog
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
        isLate
      }
    })

    return Response.json({
      message: 'Time log recorded successfully',
      geofenceStatus,
      isLate,
      logId: newLog.id
    }, { status: 201 })
  }
}
