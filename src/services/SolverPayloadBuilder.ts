/**
 * SolverPayloadBuilder — Service Layer
 *
 * Pure functions that transform Payload CMS documents into the JSON contract
 * expected by the Python OR-Tools solver. No DB calls, no side-effects.
 * This makes the serialization logic independently unit-testable.
 *
 * CONTRACT: This interface is the shared type between TypeScript and Python.
 * Any field added here MUST also be read in solver.py.
 */

// ─── Shared Typed Contract (TypeScript <-> Python boundary) ──────────────────

export type SolverWorkerPayload = {
  id: string
  maxWeeklyHours: number
  currentHours: number
  certifications: string[]
  unavailabilityBlocks: Array<{
    startTime: string // ISO 8601
    endTime: string   // ISO 8601
  }>
}

export type SolverSlotPayload = {
  shiftId: string
  blockIndex: number
  durationHours: number
  startTime: string   // ISO 8601 — used by Python datetime.fromisoformat()
  endTime: string     // ISO 8601 — used by Python datetime.fromisoformat()
  startTimeMs: number // Unix ms — used for integer gap/overlap math
  endTimeMs: number   // Unix ms — used for integer gap/overlap math
  requiredCerts: string[]
  targetWorkerId?: string // Optional constraint to force a slot to a specific worker
}

export type SolverJobPayload = {
  jobId: string
  tenantId: string
  tenantSettings: Record<string, unknown>
  workers: SolverWorkerPayload[]
  slots: SolverSlotPayload[]
}

// ─── Builder Functions ────────────────────────────────────────────────────────

/**
 * Calculates the hours a worker has already been scheduled within a window.
 * Used to enforce maxWeeklyHours constraints.
 */
export function buildWorkerCurrentHours(
  workerIds: string[],
  scheduledShifts: any[]
): Record<string, number> {
  const hours: Record<string, number> = {}
  workerIds.forEach(id => { hours[id] = 0 })

  scheduledShifts.forEach(shift => {
    const staffIds = (shift.assignedStaff || []).map((s: any) =>
      typeof s === 'object' ? s.id : s
    )
    const duration =
      (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / 3_600_000

    staffIds.forEach((id: string) => {
      if (hours[id] !== undefined) {
        hours[id] += duration
      }
    })
  })

  return hours
}

/**
 * Serializes a worker document + their unavailabilities into the Python contract.
 */
export function buildWorkerPayload(
  worker: any,
  unavailabilities: any[],
  currentHours: number,
  defaultMaxHours: number
): SolverWorkerPayload {
  const blocks = unavailabilities
    .filter((u: any) => {
      const wId = typeof u.workerId === 'object' ? u.workerId.id : u.workerId
      return wId === worker.id
    })
    .map((u: any) => ({
      startTime: u.startTime as string,
      endTime: u.endTime as string,
    }))

  return {
    id: worker.id,
    maxWeeklyHours: worker.maxWeeklyHours ?? defaultMaxHours,
    currentHours,
    certifications: (worker.certifications || []).map((c: any) =>
      typeof c === 'object' ? c.id : c
    ),
    unavailabilityBlocks: blocks,
  }
}

/**
 * Serializes a shift document into one or more slot payloads
 * (one per staffing requirement × count).
 */
export function buildSlotsForShift(shift: any): SolverSlotPayload[] {
  const slots: SolverSlotPayload[] = []
  const startMs = new Date(shift.startTime).getTime()
  const endMs = new Date(shift.endTime).getTime()
  const durationHours = (endMs - startMs) / 3_600_000

  const shiftBaseCerts = (
    (shift.department as any)?.requiredBaseCertifications || []
  ).map((c: any) => (typeof c === 'object' ? c.id : c))

  const reqs: any[] = shift.staffingRequirements || []

  reqs.forEach((reqBlock: any, blockIndex: number) => {
    const count = reqBlock.count || 1

    let blockCerts: string[] = []
    if (reqBlock.blockType === 'SpecialistReq' && reqBlock.cert) {
      blockCerts.push(typeof reqBlock.cert === 'object' ? reqBlock.cert.id : reqBlock.cert)
    } else if (reqBlock.blockType === 'RoleRequirement' && reqBlock.mustHaveCerts) {
      blockCerts = reqBlock.mustHaveCerts.map((c: any) =>
        typeof c === 'object' ? c.id : c
      )
    }

    const requiredCerts = [...new Set([...shiftBaseCerts, ...blockCerts])]

    for (let i = 0; i < count; i++) {
      slots.push({
        shiftId: shift.id,
        blockIndex,
        durationHours,
        startTime: shift.startTime as string,
        endTime: shift.endTime as string,
        startTimeMs: startMs,
        endTimeMs: endMs,
        requiredCerts,
      })
    }
  })

  return slots
}

/**
 * Generates a candidate slot specific to a worker for a given date.
 */
export function buildGeneratedSlotsForWorker(
  worker: any,
  dateStr: string,
  departmentId: string,
  timezoneOffset: number = 0
): SolverSlotPayload[] {
  if (!worker.jobRole || !worker.jobRole.defaultStartTime || !worker.jobRole.defaultEndTime) {
    return []
  }

  // Parse local hours/minutes
  const [startH, startM] = worker.jobRole.defaultStartTime.split(':').map(Number)
  const [endH, endM] = worker.jobRole.defaultEndTime.split(':').map(Number)

  // Construct base UTC dates for the day
  const slotStart = new Date(`${dateStr}T00:00:00.000Z`)
  const slotEnd = new Date(`${dateStr}T00:00:00.000Z`)

  // Add the local time components, then add timezone offset (in minutes) 
  // timezoneOffset returns UTC - Local in minutes. Example: +08:00 is -480.
  // So UTC Time = Local Time + Offset
  slotStart.setUTCHours(startH, startM + timezoneOffset, 0, 0)
  slotEnd.setUTCHours(endH, endM + timezoneOffset, 0, 0)
  
  let durMs = slotEnd.getTime() - slotStart.getTime()
  if (durMs < 0) {
    // If end time is before start time, it crosses midnight. Add 24 hours.
    durMs += 24 * 60 * 60 * 1000 
    slotEnd.setTime(slotEnd.getTime() + 24 * 60 * 60 * 1000)
  }
  
  const durationHours = durMs / 3_600_000
  const jobRoleId = typeof worker.jobRole === 'object' ? worker.jobRole.id : worker.jobRole

  return [{
    shiftId: `NEW__${worker.id}__${slotStart.getTime()}__${slotEnd.getTime()}__${jobRoleId}__${departmentId}`,
    blockIndex: 0,
    targetWorkerId: worker.id,
    durationHours,
    startTime: slotStart.toISOString(),
    endTime: slotEnd.toISOString(),
    startTimeMs: slotStart.getTime(),
    endTimeMs: slotEnd.getTime(),
    requiredCerts: [], // Assumed covered by the worker's role
  }]
}
