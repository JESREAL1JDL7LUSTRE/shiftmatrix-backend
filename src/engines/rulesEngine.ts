import { User, Shift, Tenant } from '../payload-types'

export function checkTimeConflict(shift: Shift, scheduledShifts: Shift[]): boolean {
  const newStart = new Date(shift.startTime).getTime()
  const newEnd = new Date(shift.endTime).getTime()

  for (const scheduled of scheduledShifts) {
    const sStart = new Date(scheduled.startTime).getTime()
    const sEnd = new Date(scheduled.endTime).getTime()
    // Exact overlap condition
    if (newStart < sEnd && newEnd > sStart) {
      return true
    }
  }
  return false
}

export function checkUnionRestRules(shift: Shift, scheduledShifts: Shift[]): boolean {
  // Requires a 12-hour gap between shifts
  const gapMs = 12 * 60 * 60 * 1000
  const newStart = new Date(shift.startTime).getTime()
  const newEnd = new Date(shift.endTime).getTime()

  for (const scheduled of scheduledShifts) {
    const sStart = new Date(scheduled.startTime).getTime()
    const sEnd = new Date(scheduled.endTime).getTime()
    
    if (sEnd <= newStart && (newStart - sEnd) < gapMs) return true
    if (sStart >= newEnd && (sStart - newEnd) < gapMs) return true
  }
  return false
}

export function checkCertifications(user: User, shift: any, requirementBlock: any): boolean {
  const userCertIds = (user.certifications || []).map(c => typeof c === 'object' ? c.id : c)

  // 1. Check Base Department Certifications
  if (shift.department && shift.department.requiredBaseCertifications) {
    for (const reqCert of shift.department.requiredBaseCertifications) {
      const reqId = typeof reqCert === 'object' ? reqCert.id : reqCert
      if (!userCertIds.includes(reqId)) return false
    }
  }

  // 2. Check Block Specific Certifications
  if (requirementBlock && requirementBlock.blockType === 'SpecialistReq') {
    const reqId = typeof requirementBlock.cert === 'object' ? requirementBlock.cert.id : requirementBlock.cert
    if (!userCertIds.includes(reqId)) return false
  }
  
  if (requirementBlock && requirementBlock.blockType === 'RoleRequirement' && requirementBlock.mustHaveCerts) {
     for (const reqCert of requirementBlock.mustHaveCerts) {
        const reqId = typeof reqCert === 'object' ? reqCert.id : reqCert
        if (!userCertIds.includes(reqId)) return false
     }
  }

  return true
}

export function evaluateEligibility(
  worker: User,
  shift: Shift,
  requirementBlock: any,
  tenantSettings: any,
  scheduledShifts: Shift[],
  currentWeeklyHours: number
): { eligible: boolean; reason?: string } {

  if (checkTimeConflict(shift, scheduledShifts)) {
    return { eligible: false, reason: 'Time conflict with existing shift.' }
  }

  if (tenantSettings?.activateUnionRestRules) {
    if (checkUnionRestRules(shift, scheduledShifts)) {
      return { eligible: false, reason: 'Violates 12-hour union rest rule.' }
    }
  }

  const shiftDurationHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60)
  const limit = worker.maxWeeklyHours || tenantSettings?.maxWeeklyHours || 40
  
  if (currentWeeklyHours + shiftDurationHours > limit) {
    return { eligible: false, reason: `Exceeds max weekly hours (${limit}h).` }
  }

  if (!checkCertifications(worker, shift, requirementBlock)) {
    return { eligible: false, reason: 'Missing required certifications.' }
  }

  return { eligible: true }
}
