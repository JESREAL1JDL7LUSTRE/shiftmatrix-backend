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
  buildGeneratedSlotsForWorker,
  buildSlotsForShift,
  type SolverJobPayload,
} from './SolverPayloadBuilder'

export type EnqueueOptions = {
  tenantId: string
  startDate: string
  endDate: string
  timezoneOffset?: number
}

/**
 * Fetches all scheduling data, serializes the OR-Tools payload,
 * creates the SchedulingRun job record, and pushes to the Redis queue.
 * Returns the jobId for the caller to relay back to the client.
 */
export async function enqueueSchedulingJob(
  payload: Payload,
  { tenantId, startDate, endDate, timezoneOffset = 0 }: EnqueueOptions
): Promise<string> {
  // 1. Fetch available departments for fallback (since shifts require a department)
  const deptsRes = await payload.find({
    collection: 'departments',
    where: { tenantId: { equals: tenantId } },
    limit: 1,
  })
  const fallbackDeptId = deptsRes.docs.length > 0 ? (deptsRes.docs[0].id as string) : ''

  // Fetch CalendarEvents (holidays/breaks)
  const calendarEventsRes = await payload.find({
    collection: 'calendar-events',
    where: {
      tenantId: { equals: tenantId },
      and: [
        { endDate: { greater_than_equal: startDate } },
        { startDate: { less_than_equal: endDate } },
      ]
    },
    limit: 1000,
  })
  const calendarEvents = calendarEventsRes.docs

  // 2. Fetch all workers in the tenant
  const workersRes = await payload.find({
    collection: 'users',
    where: {
      tenantId: { equals: tenantId },
      role: { equals: 'worker' },
    },
    limit: 1000,
  })

  // 3. Fetch approved unavailabilities (both temporary overlapping, and permanent)
  const unavailRes = await payload.find({
    collection: 'unavailabilities',
    where: {
      tenantId: { equals: tenantId },
      status: { equals: 'approved' },
      or: [
        { type: { equals: 'permanent' } },
        {
          and: [
            { type: { equals: 'temporary' } },
            { endTime: { greater_than: startDate } },
            { startTime: { less_than: endDate } },
          ]
        }
      ]
    },
    limit: 5000,
  })

  // 4. Fetch tenant settings
  const tenantDoc = await payload.findByID({ collection: 'tenants', id: tenantId as any })
  const tenantSettings = (tenantDoc as any).TenantSettings?.[0] ?? {}
  const defaultMaxHours: number = tenantSettings.maxWeeklyHours ?? 40

  // 5. Fetch all existing shifts in the window (for current hours and to avoid duplicates)
  const existingShiftsRes = await payload.find({
    collection: 'shifts',
    where: {
      tenantId: { equals: tenantId },
      and: [
        { startTime: { greater_than_equal: startDate } },
        { startTime: { less_than_equal: endDate } },
      ],
    },
    depth: 1,
    limit: 5000,
  })

  // 6. Build current hours map (pure function — no DB)
  const workerIds = workersRes.docs.map((w: any) => w.id as string)
  const currentHours = buildWorkerCurrentHours(workerIds, existingShiftsRes.docs.filter((s: any) => s.assignedStaff?.length > 0))

  // 7. Build workers payload (pure function — no DB)
  const workers = workersRes.docs.map((w: any) =>
    buildWorkerPayload(w, unavailRes.docs, currentHours[w.id] ?? 0, defaultMaxHours, startDate, endDate, timezoneOffset)
  )

  // 8. Build slots payload dynamically based on worker job roles
  const slots: any[] = []
  const startD = new Date(startDate)
  const endD = new Date(endDate)

  // First, add all existing shifts as slots
  for (const shift of existingShiftsRes.docs) {
    const shiftSlots = buildSlotsForShift(shift)
    slots.push(...shiftSlots)
  }

  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    // Convert the UTC loop pointer to Local time before extracting the date string
    const localD = new Date(d.getTime() - (timezoneOffset * 60 * 1000))
    const dateStr = localD.toISOString().split('T')[0]

    for (const worker of workersRes.docs) {
      const preferredDept = worker.preferences?.preferredDepartments?.[0]
      const deptId = preferredDept
        ? (typeof preferredDept === 'object' ? preferredDept.id : preferredDept)
        : fallbackDeptId

      const generatedSlots = buildGeneratedSlotsForWorker(
        worker, 
        dateStr, 
        deptId, 
        timezoneOffset,
        calendarEvents,
        existingShiftsRes.docs
      )
      slots.push(...generatedSlots)
    }
  }

  // 9. Generate job ID and create the SchedulingRun tracking record
  const jobId = randomUUID()
  const uniqueShiftIds = [...new Set(slots.map(s => s.shiftId))].filter(id => !id.startsWith('NEW__'))

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
