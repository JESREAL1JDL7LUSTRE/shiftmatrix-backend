/**
 * SchedulingService — Service Layer
 *
 * Orchestrates the complete auto-fill scheduling flow:
 * 1. Fetches all required data from Payload CMS
 * 2. Delegates serialization to SolverPayloadBuilder (pure functions)
 * 3. Creates the SchedulingRun tracking record
 * 4. Delegates queue push to QueueService (infrastructure)
 *
 * The endpoint handler becomes a thin controller that just calls enqueue().
 */
import { randomUUID } from 'crypto'
import type { Payload } from 'payload'
import { enqueueJob } from '../infrastructure/QueueService'
import {
  buildWorkerCurrentHours,
  buildWorkerPayload,
  buildSlotsForShift,
  type SolverJobPayload,
} from './SolverPayloadBuilder'

export type EnqueueOptions = {
  tenantId: string
  startDate: string
  endDate: string
}

/**
 * Fetches all scheduling data, serializes the OR-Tools payload,
 * creates the SchedulingRun job record, and pushes to the Redis queue.
 * Returns the jobId for the caller to relay back to the client.
 */
export async function enqueueSchedulingJob(
  payload: Payload,
  { tenantId, startDate, endDate }: EnqueueOptions
): Promise<string> {
  // 1. Fetch open shifts in the date window
  const shiftsRes = await payload.find({
    collection: 'shifts',
    where: {
      tenantId: { equals: tenantId },
      status: { equals: 'published' },
      startTime: { greater_than_equal: startDate },
      endTime: { less_than_equal: endDate },
    },
    depth: 2,
    limit: 1000,
  })

  // 2. Fetch all workers in the tenant
  const workersRes = await payload.find({
    collection: 'users',
    where: {
      tenantId: { equals: tenantId },
      role: { equals: 'worker' },
    },
    limit: 1000,
  })

  // 3. Fetch approved unavailability blocks overlapping the window
  const unavailRes = await payload.find({
    collection: 'unavailabilities',
    where: {
      tenantId: { equals: tenantId },
      status: { equals: 'approved' },
      and: [
        { endTime: { greater_than: startDate } },
        { startTime: { less_than: endDate } },
      ],
    },
    limit: 5000,
  })

  // 4. Fetch tenant settings
  const tenantDoc = await payload.findByID({ collection: 'tenants', id: tenantId as any })
  const tenantSettings = (tenantDoc as any).TenantSettings?.[0] ?? {}
  const defaultMaxHours: number = tenantSettings.maxWeeklyHours ?? 40

  // 5. Fetch already-scheduled shifts to compute current hours
  const scheduledRes = await payload.find({
    collection: 'shifts',
    where: {
      tenantId: { equals: tenantId },
      assignedStaff: { exists: true },
      startTime: { greater_than_equal: startDate },
    },
    depth: 1,
    limit: 5000,
  })

  // 6. Build current hours map (pure function — no DB)
  const workerIds = workersRes.docs.map((w: any) => w.id as string)
  const currentHours = buildWorkerCurrentHours(workerIds, scheduledRes.docs)

  // 7. Build workers payload (pure function — no DB)
  const workers = workersRes.docs.map((w: any) =>
    buildWorkerPayload(w, unavailRes.docs, currentHours[w.id] ?? 0, defaultMaxHours)
  )

  // 8. Build slots payload (pure function — no DB)
  const slots = shiftsRes.docs.flatMap((shift: any) => buildSlotsForShift(shift))

  // 9. Generate job ID and create the SchedulingRun tracking record
  const jobId = randomUUID()
  const uniqueShiftIds = [...new Set(slots.map(s => s.shiftId))]

  await payload.create({
    collection: 'schedulingRuns',
    data: {
      jobId,
      tenantId,
      status: 'pending',
      shiftsInvolved: uniqueShiftIds,
    },
  })

  // 10. Push to queue (infrastructure layer)
  const jobPayload: SolverJobPayload = {
    jobId,
    tenantId,
    tenantSettings,
    workers,
    slots,
  }
  await enqueueJob(jobPayload)

  return jobId
}
