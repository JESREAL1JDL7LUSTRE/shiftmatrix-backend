import type { Payload } from 'payload'
import { emitNotification } from '../infrastructure/NotificationBus'

export type SolverAssignment = {
  shiftId: string
  workerId: string
}

export async function handleSolverFailure(payload: Payload, jobId: string, reason: string) {
  // Update SchedulingRuns to failed
  const runs = await payload.find({
    collection: 'schedulingRuns',
    where: { jobId: { equals: jobId } },
    limit: 1
  })

  if (runs.docs.length > 0) {
    await payload.update({
      collection: 'schedulingRuns',
      id: runs.docs[0].id,
      data: {
        status: 'failed',
        errorReason: reason
      }
    })
    
    const tId = typeof runs.docs[0].tenantId === 'object' ? runs.docs[0].tenantId.id : runs.docs[0].tenantId;
    const admins = await payload.find({
      collection: 'users',
      where: { tenantId: { equals: tId }, role: { equals: 'admin' } },
      limit: 100
    });
    
    for (const admin of admins.docs) {
      emitNotification({
        recipientId: admin.id,
        title: 'Auto-Fill Failed',
        message: `Solver failed: ${reason}`
      });
    }
  }
}

export async function applySolverAssignments(payload: Payload, jobId: string, assignments: SolverAssignment[]) {
  try {
    // Group assignments by shiftId
    const shiftMap: Record<string, string[]> = {}
    for (const a of assignments) {
      if (!shiftMap[a.shiftId]) shiftMap[a.shiftId] = []
      shiftMap[a.shiftId].push(a.workerId)
    }

    // Fetch SchedulingRuns first to access tenantId
    const runs = await payload.find({
      collection: 'schedulingRuns',
      where: { jobId: { equals: jobId } },
      limit: 1
    })
    const tenantId = runs.docs.length > 0 ? runs.docs[0].tenantId : null

    const updates = []
    for (const [shiftId, workerIds] of Object.entries(shiftMap)) {
      const newStaff = [...new Set([...workerIds])]

      if (shiftId.startsWith('NEW__')) {
        const parts = shiftId.split('__')
        const startMs = parseInt(parts[2])
        const endMs = parseInt(parts[3])
        const jobRoleId = parts[4]
        const departmentId = parts[5] || ''

        if (tenantId) {
          updates.push(payload.create({
            collection: 'shifts',
            data: {
              tenantId: typeof tenantId === 'object' ? tenantId.id : tenantId,
              department: departmentId,
              startTime: new Date(startMs).toISOString(),
              endTime: new Date(endMs).toISOString(),
              status: 'draft',
              assignedStaff: newStaff as any,
              staffingRequirements: [
                {
                  blockType: 'RoleRequirement',
                  role: jobRoleId,
                  count: 1,
                }
              ]
            }
          }))
        }
      } else {
        const currentShift = await payload.findByID({ collection: 'shifts', id: shiftId })
        const shiftReqCount = (currentShift.staffingRequirements || []).reduce((acc: number, req: any) => acc + (req.count || 1), 0)
        const isFilled = newStaff.length >= shiftReqCount

        updates.push(payload.update({
          collection: 'shifts',
          id: shiftId,
          data: {
            assignedStaff: newStaff as any,
            status: isFilled ? 'filled' : 'published'
          }
        }))
      }
    }

    await Promise.all(updates)

    // Update SchedulingRuns to completed
    if (runs.docs.length > 0) {
      await payload.update({
        collection: 'schedulingRuns',
        id: runs.docs[0].id,
        data: { status: 'completed' }
      })
    }

    // Notify admins of success so UI can real-time refresh
    if (tenantId) {
      const tId = typeof tenantId === 'object' ? tenantId.id : tenantId;
      const admins = await payload.find({
        collection: 'users',
        where: { tenantId: { equals: tId }, role: { equals: 'admin' } },
        limit: 100
      });
      
      for (const admin of admins.docs) {
        emitNotification({
          recipientId: admin.id,
          title: 'Schedule Generated',
          message: 'Auto-Fill computation finished successfully. Your view has been refreshed.'
        });
      }
    }
  } catch (err) {
    console.error(`[Solver Webhook Async Error] ${err}`)
  }
}
