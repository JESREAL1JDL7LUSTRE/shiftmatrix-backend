import { PayloadHandler, Endpoint } from 'payload'
import Redis from 'ioredis'
import { randomUUID } from 'crypto'

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379/0')

export const autoFillEndpoint: Endpoint = {
  path: '/auto-fill',
  method: 'post',
  handler: async (req) => {
    let body
    try {
      body = await req.json?.()
    } catch {
      body = req.body || {}
    }

    const { startDate, endDate } = body
    if (!startDate || !endDate) {
      return Response.json({ error: 'startDate and endDate required' }, { status: 400 })
    }

    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tId = typeof tenantId === 'object' ? tenantId.id : tenantId

    const shiftsRes = await req.payload.find({
      collection: 'shifts',
      where: {
        tenantId: { equals: tId },
        status: { equals: 'published' },
        startTime: { greater_than_equal: startDate },
        endTime: { less_than_equal: endDate },
      },
      depth: 2,
      limit: 1000
    })

    const workersRes = await req.payload.find({
      collection: 'users',
      where: {
        tenantId: { equals: tId },
        role: { equals: 'worker' }
      },
      limit: 1000
    })

    const unavailRes = await req.payload.find({
      collection: 'unavailabilities',
      where: {
        tenantId: { equals: tId },
        status: { equals: 'approved' },
        and: [
          { endTime: { greater_than: startDate } },
          { startTime: { less_than: endDate } }
        ]
      },
      limit: 5000
    })

    const tenantRes = await req.payload.findByID({
      collection: 'tenants',
      id: tId as any
    })
    const tenantSettings = (tenantRes as any).TenantSettings?.[0] || {}

    const scheduledRes = await req.payload.find({
      collection: 'shifts',
      where: {
        tenantId: { equals: tId },
        assignedStaff: { exists: true },
        startTime: { greater_than_equal: startDate },
      },
      depth: 1,
      limit: 5000
    })

    const workerCurrentHours: Record<string, number> = {}
    workersRes.docs.forEach(w => {
      workerCurrentHours[w.id] = 0
    })

    scheduledRes.docs.forEach(shift => {
      const staffIds = (shift.assignedStaff || []).map(s => typeof s === 'object' ? s.id : s)
      const duration = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / 3600000
      
      staffIds.forEach(id => {
        if (workerCurrentHours[id] !== undefined) {
          workerCurrentHours[id] += duration
        }
      })
    })

    // Format Data for OR-Tools Python Worker
    const workersPayload = workersRes.docs.map((w: any) => {
      const blocks = unavailRes.docs
        .filter((u: any) => (typeof u.workerId === 'object' ? u.workerId.id : u.workerId) === w.id)
        .map((u: any) => ({
          startTime: u.startTime,
          endTime: u.endTime
        }))

      return {
        id: w.id,
        maxWeeklyHours: w.maxWeeklyHours || tenantSettings.maxWeeklyHours || 40,
        currentHours: workerCurrentHours[w.id] || 0,
        certifications: (w.certifications || []).map((c: any) => typeof c === 'object' ? c.id : c),
        unavailabilityBlocks: blocks
      }
    })

    const slotsPayload: any[] = []
    for (const shift of shiftsRes.docs) {
      const shiftBaseCerts = (shift.ward as any)?.requiredBaseCertifications?.map((c: any) => typeof c === 'object' ? c.id : c) || []
      const durationHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / 3600000
      const startTimeMs = new Date(shift.startTime).getTime()
      const endTimeMs = new Date(shift.endTime).getTime()

      const reqs = shift.staffingRequirements || []
      reqs.forEach((reqBlock: any, blockIndex: number) => {
        const count = reqBlock.count || 1
        
        let blockCerts: string[] = []
        if (reqBlock.blockType === 'SpecialistReq' && reqBlock.cert) {
          blockCerts.push(typeof reqBlock.cert === 'object' ? reqBlock.cert.id : reqBlock.cert)
        } else if (reqBlock.blockType === 'RoleRequirement' && reqBlock.mustHaveCerts) {
          blockCerts = reqBlock.mustHaveCerts.map((c: any) => typeof c === 'object' ? c.id : c)
        }

        const requiredCerts = [...new Set([...shiftBaseCerts, ...blockCerts])]

        for (let i = 0; i < count; i++) {
           slotsPayload.push({
             shiftId: shift.id,
             blockIndex,
             durationHours,
             startTimeMs,
             endTimeMs,
             requiredCerts
           })
        }
      })
    }

    const jobId = randomUUID()

    const uniqueShiftIds = [...new Set(slotsPayload.map(s => s.shiftId))]

    // Create SchedulingRun record
    await req.payload.create({
      collection: 'schedulingRuns',
      data: {
        jobId,
        tenantId: tId,
        status: 'pending',
        shiftsInvolved: uniqueShiftIds
      }
    })

    const jobData = {
      jobId,
      tenantId: tId,
      tenantSettings,
      workers: workersPayload,
      slots: slotsPayload
    }

    // Push to Redis Queue
    await redis.lpush('shift_solver_queue', JSON.stringify(jobData))

    return Response.json({
      message: 'Schedule computation queued successfully.',
      jobId,
      status: 'processing'
    }, { status: 202 })
  }
}
