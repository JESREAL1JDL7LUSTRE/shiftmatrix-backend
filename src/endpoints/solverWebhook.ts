import { PayloadHandler, Endpoint } from 'payload'
import crypto from 'crypto'

export const solverWebhookEndpoint: Endpoint = {
  path: '/solver-webhook',
  method: 'post',
  handler: async (req) => {
    const rawBody = await req.text?.() || ''
    
    // HMAC Verification
    const signature = req.headers.get('x-webhook-signature')
    const secret = process.env.WORKER_SECRET
    
    if (secret && signature) {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
      if (signature !== expectedSignature) {
        return Response.json({ error: 'Unauthorized payload' }, { status: 401 })
      }
    } else if (secret && !signature) {
      return Response.json({ error: 'Missing signature' }, { status: 401 })
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { success, assignments, jobId, reason } = body

    if (!success) {
      console.log(`[Solver Webhook] Job ${jobId} failed to solve: ${reason}`)
      
      // Update SchedulingRuns to failed
      const runs = await req.payload.find({
        collection: 'schedulingRuns',
        where: { jobId: { equals: jobId } },
        limit: 1
      })

      if (runs.docs.length > 0) {
        await req.payload.update({
          collection: 'schedulingRuns',
          id: runs.docs[0].id,
          data: {
            status: 'failed',
            errorReason: reason
          }
        })
      }

      return Response.json({ received: true })
    }

    console.log(`[Solver Webhook] Applying solved matrix for Job ${jobId}. Found ${assignments?.length} assignments.`)

    if (assignments && assignments.length > 0) {
      // Group assignments by shiftId
      const shiftMap: Record<string, string[]> = {}
      for (const a of assignments) {
        if (!shiftMap[a.shiftId]) shiftMap[a.shiftId] = []
        shiftMap[a.shiftId].push(a.workerId)
      }

      const updates = []
      for (const [shiftId, workerIds] of Object.entries(shiftMap)) {
        const currentShift = await req.payload.findByID({ collection: 'shifts', id: shiftId })
        const newStaff = [...new Set([...workerIds])]
        
        const shiftReqCount = (currentShift.staffingRequirements || []).reduce((acc: number, req: any) => acc + (req.count || 1), 0)
        const isFilled = newStaff.length >= shiftReqCount

        updates.push(req.payload.update({
          collection: 'shifts',
          id: shiftId,
          data: {
            assignedStaff: newStaff as any,
            status: isFilled ? 'filled' : 'published'
          }
        }))
      }

      await Promise.all(updates)

      // Update SchedulingRuns to completed
      const runs = await req.payload.find({
        collection: 'schedulingRuns',
        where: { jobId: { equals: jobId } },
        limit: 1
      })

      if (runs.docs.length > 0) {
        await req.payload.update({
          collection: 'schedulingRuns',
          id: runs.docs[0].id,
          data: { status: 'completed' }
        })
      }
    }

    return Response.json({ message: 'Schedule applied successfully' })
  }
}
