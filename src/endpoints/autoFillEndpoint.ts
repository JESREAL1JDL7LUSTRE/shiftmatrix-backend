/**
 * autoFillEndpoint — Thin Controller
 *
 * Validates request input, resolves tenantId, then delegates entirely
 * to SchedulingService. No business logic lives here.
 */
import type { Endpoint } from 'payload'
import { enqueueSchedulingJob } from '../services/SchedulingService'

export const autoFillEndpoint: Endpoint = {
  path: '/auto-fill',
  method: 'post',
  handler: async (req) => {
    let body: any
    try {
      body = await req.json?.()
    } catch {
      body = req.body || {}
    }

    const { startDate, endDate } = body
    if (!startDate || !endDate) {
      return Response.json({ error: 'startDate and endDate required' }, { status: 400 })
    }

    if (!req.user?.tenantId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId =
      typeof req.user.tenantId === 'object'
        ? (req.user.tenantId as any).id
        : req.user.tenantId

    const jobId = await enqueueSchedulingJob(req.payload, { tenantId, startDate, endDate })

    return Response.json(
      { message: 'Schedule computation queued successfully.', jobId, status: 'processing' },
      { status: 202 }
    )
  },
}
