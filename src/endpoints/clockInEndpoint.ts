/**
 * clockInEndpoint — Thin Controller
 *
 * Validates input and user auth, then delegates geo-fencing and late-check
 * math to AttendanceService. No business logic lives here.
 */
import type { Endpoint } from 'payload'
import { z } from 'zod'
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

    const clockInSchema = z.object({
      shiftId: z.string().min(1, 'shiftId is required'),
      lat: z.number(),
      lng: z.number(),
      eventType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end', 'correction']),
      qrToken: z.string().min(1, 'qrToken is required')
    })

    const parsed = clockInSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { shiftId, lat, lng, eventType, qrToken } = parsed.data

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
