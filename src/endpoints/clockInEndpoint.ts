/**
 * clockInEndpoint — Thin Controller
 *
 * Validates input and user auth, then delegates geo-fencing and late-check
 * math to AttendanceService. No business logic lives here.
 */
import type { Endpoint } from 'payload'
import { processClockIn } from '../services/TimeLogApplicationService'

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

    const { shiftId, lat, lng, eventType, qrToken } = body

    if (!shiftId || lat === undefined || lng === undefined || !eventType || !qrToken) {
      return Response.json(
        { error: 'shiftId, lat, lng, eventType, and qrToken are required' },
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

    try {
      const result = await processClockIn(req.payload, {
        shiftId,
        lat,
        lng,
        eventType,
        qrToken,
        workerId,
        tenantId
      })

      return Response.json(
        { message: 'Time log recorded successfully', ...result },
        { status: 201 }
      )
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 
                     error.message.includes('QR Token') ? 403 : 400
                     
      return Response.json({ error: error.message || 'An error occurred during clock in' }, { status })
    }
  },
}
