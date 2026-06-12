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
  jobRole?: string
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
  requiredRole?: string // Must match worker's job role
  targetWorkerId?: string // Optional constraint to force a slot to a specific worker
  previouslyAssignedWorkers?: string[] // For minimum perturbation logic
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
  defaultMaxHours: number,
  startDateStr: string = new Date().toISOString(),
  endDateStr: string = new Date().toISOString(),
  timezoneOffset: number = 0
): SolverWorkerPayload {
  const blocks: Array<{startTime: string, endTime: string}> = []
  
  const workerUnavailabilities = unavailabilities.filter((u: any) => {
    const wId = typeof u.workerId === 'object' ? u.workerId.id : u.workerId
    return wId === worker.id
  })

  workerUnavailabilities.forEach((u: any) => {
    if (u.type === 'temporary' || !u.type) {
      blocks.push({
        startTime: u.startTime as string,
        endTime: u.endTime as string,
      })
    } else if (u.type === 'permanent' && u.daysOfWeek && u.daysOfWeek.length > 0) {
      const startD = new Date(startDateStr)
      const endD = new Date(endDateStr)
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const localD = new Date(d.getTime() - (timezoneOffset * 60 * 1000))
        const dateStr = localD.toISOString().split('T')[0]
        
        const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
        const dayName = dayNames[dayOfWeek]
        
        if (u.daysOfWeek.includes(dayName)) {
          const slotStart = new Date(`${dateStr}T00:00:00.000Z`)
          const slotEnd = new Date(`${dateStr}T00:00:00.000Z`)

          const startH = u.permanentStartTime ? parseInt(u.permanentStartTime.split(':')[0]) : 0
          const startM = u.permanentStartTime ? parseInt(u.permanentStartTime.split(':')[1]) : 0
          const endH = u.permanentEndTime ? parseInt(u.permanentEndTime.split(':')[0]) : 23
          const endM = u.permanentEndTime ? parseInt(u.permanentEndTime.split(':')[1]) : 59

          slotStart.setUTCHours(startH, startM + timezoneOffset, 0, 0)
          slotEnd.setUTCHours(endH, endM + timezoneOffset, 0, 0)
          
          if (slotEnd.getTime() < slotStart.getTime()) {
            slotEnd.setTime(slotEnd.getTime() + 24 * 60 * 60 * 1000)
          }

          blocks.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString()
          })
        }
      }
    }
  })

  return {
    id: worker.id,
    jobRole: typeof worker.jobRole === 'object' ? worker.jobRole?.id : worker.jobRole,
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
export function buildSlotsForShift(
  shift: any,
  tenantSettings: any = {},
  timezoneOffset: number = 0
): SolverSlotPayload[] {
  const slots: SolverSlotPayload[] = []
  const startMs = new Date(shift.startTime).getTime()
  const endMs = new Date(shift.endTime).getTime()
  let durationHours = (endMs - startMs) / 3_600_000

  // Lunch deduction
  const lunchStartStr = tenantSettings.lunchStartTime || '12:00'
  const lunchEndStr = tenantSettings.lunchEndTime || '13:00'
  if (lunchStartStr && lunchEndStr) {
    const [lStartH, lStartM] = lunchStartStr.split(':').map(Number)
    const [lEndH, lEndM] = lunchEndStr.split(':').map(Number)
    
    // Get local date string for the shift
    const localD = new Date(startMs - (timezoneOffset * 60 * 1000))
    const dateStr = localD.toISOString().split('T')[0]
    
    const lunchStart = new Date(`${dateStr}T00:00:00.000Z`)
    lunchStart.setUTCHours(lStartH, lStartM + timezoneOffset, 0, 0)
    
    const lunchEnd = new Date(`${dateStr}T00:00:00.000Z`)
    lunchEnd.setUTCHours(lEndH, lEndM + timezoneOffset, 0, 0)
    
    const overlapStart = Math.max(startMs, lunchStart.getTime())
    const overlapEnd = Math.min(endMs, lunchEnd.getTime())
    
    if (overlapEnd > overlapStart) {
      const deduction = (overlapEnd - overlapStart) / 3_600_000
      durationHours = Math.max(0, durationHours - deduction)
    }
  }

  const shiftBaseCerts = (
    (shift.department as any)?.requiredBaseCertifications || []
  ).map((c: any) => (typeof c === 'object' ? c.id : c))

  const reqs: any[] = shift.staffingRequirements || []

  reqs.forEach((reqBlock: any, blockIndex: number) => {
    const count = reqBlock.count || 1

    let blockCerts: string[] = []
    let blockRole: string | undefined

    if (reqBlock.blockType === 'SpecialistReq' && reqBlock.cert) {
      blockCerts.push(typeof reqBlock.cert === 'object' ? reqBlock.cert.id : reqBlock.cert)
    } else if (reqBlock.blockType === 'RoleRequirement') {
      if (reqBlock.mustHaveCerts) {
        blockCerts = reqBlock.mustHaveCerts.map((c: any) =>
          typeof c === 'object' ? c.id : c
        )
      }
      if (reqBlock.role) {
        blockRole = typeof reqBlock.role === 'object' ? reqBlock.role.id : reqBlock.role
      }
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
        requiredRole: blockRole,
        previouslyAssignedWorkers: (shift.assignedStaff || []).map((s: any) => typeof s === 'object' ? s.id : s),
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
  timezoneOffset: number = 0,
  calendarEvents: any[] = [],
  existingShifts: any[] = [],
  tenantSettings: any = {}
): SolverSlotPayload[] {
  if (!worker.jobRole || !worker.jobRole.defaultStartTime || !worker.jobRole.defaultEndTime) {
    return []
  }

  // 1. Check workDays
  const workDays = worker.jobRole.workDays || []
  if (workDays.length > 0) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
    const dayName = dayNames[dayOfWeek]
    if (!workDays.includes(dayName)) {
      return [] // Not scheduled to work this day
    }
  }

  // 2. Check Calendar Events (Holidays)
  const isHoliday = calendarEvents.some(event => {
    const start = new Date(event.startDate).getTime()
    const end = new Date(event.endDate).getTime()
    const current = new Date(`${dateStr}T12:00:00Z`).getTime()
    return current >= start && current <= end && event.type === 'holiday'
  })

  if (isHoliday) {
    // Only schedule if explicitly assigned to this holiday
    const isExplicitlyAssigned = calendarEvents.some(event => {
      if (event.type !== 'holiday') return false
      const staffIds = (event.assignedStaff || []).map((s: any) => typeof s === 'object' ? s.id : s)
      return staffIds.includes(worker.id)
    })
    if (!isExplicitlyAssigned) {
      return []
    }
  }

  // 3. Check existing shifts to avoid generating duplicates
  const hasExistingShift = existingShifts.some(shift => {
    const shiftDate = new Date(shift.startTime).toISOString().split('T')[0]
    if (shiftDate !== dateStr) return false
    
    // Check if worker is assigned to this shift
    const staffIds = (shift.assignedStaff || []).map((s: any) => typeof s === 'object' ? s.id : s)
    return staffIds.includes(worker.id)
  })

  if (hasExistingShift) {
    // Skip generating a NEW__ slot because the existing shift covers it and is already passed to the solver
    return []
  }

  // Parse local hours/minutes
  const [startH, startM] = worker.jobRole.defaultStartTime.split(':').map(Number)
  const [endH, endM] = worker.jobRole.defaultEndTime.split(':').map(Number)

  // Construct base UTC dates for the day
  const slotStart = new Date(`${dateStr}T00:00:00.000Z`)
  const slotEnd = new Date(`${dateStr}T00:00:00.000Z`)

  // Add the local time components, then add timezone offset (in minutes) 
  slotStart.setUTCHours(startH, startM + timezoneOffset, 0, 0)
  slotEnd.setUTCHours(endH, endM + timezoneOffset, 0, 0)
  
  let durMs = slotEnd.getTime() - slotStart.getTime()
  if (durMs < 0) {
    // If end time is before start time, it crosses midnight. Add 24 hours.
    durMs += 24 * 60 * 60 * 1000 
    slotEnd.setTime(slotEnd.getTime() + 24 * 60 * 60 * 1000)
  }
  
  let durationHours = durMs / 3_600_000

  // Lunch deduction
  const lunchStartStr = tenantSettings.lunchStartTime || '12:00'
  const lunchEndStr = tenantSettings.lunchEndTime || '13:00'
  if (lunchStartStr && lunchEndStr) {
    const [lStartH, lStartM] = lunchStartStr.split(':').map(Number)
    const [lEndH, lEndM] = lunchEndStr.split(':').map(Number)
    
    const lunchStart = new Date(`${dateStr}T00:00:00.000Z`)
    lunchStart.setUTCHours(lStartH, lStartM + timezoneOffset, 0, 0)
    
    const lunchEnd = new Date(`${dateStr}T00:00:00.000Z`)
    lunchEnd.setUTCHours(lEndH, lEndM + timezoneOffset, 0, 0)
    
    const overlapStart = Math.max(slotStart.getTime(), lunchStart.getTime())
    const overlapEnd = Math.min(slotEnd.getTime(), lunchEnd.getTime())
    
    if (overlapEnd > overlapStart) {
      const deduction = (overlapEnd - overlapStart) / 3_600_000
      durationHours = Math.max(0, durationHours - deduction)
    }
  }

  const jobRoleId = typeof worker.jobRole === 'object' ? worker.jobRole.id : worker.jobRole

  return [{
    shiftId: `NEW__${worker.id}__${slotStart.getTime()}__${slotEnd.getTime()}__${jobRoleId}__${departmentId}`,
    blockIndex: 0,
    durationHours,
    startTime: slotStart.toISOString(),
    endTime: slotEnd.toISOString(),
    startTimeMs: slotStart.getTime(),
    endTimeMs: slotEnd.getTime(),
    requiredCerts: [], // Assumed covered by the worker's role
    requiredRole: jobRoleId,
  }]
}
