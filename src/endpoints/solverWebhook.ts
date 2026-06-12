import { Endpoint } from 'payload'
import crypto from 'crypto'
import { applySolverAssignments, handleSolverFailure } from '../services/ScheduleResultService'

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
      
      // Use timingSafeEqual to prevent timing attacks
      if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
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
      await handleSolverFailure(req.payload, jobId, reason)
      return Response.json({ received: true })
    }

    console.log(`[Solver Webhook] Applying solved matrix for Job ${jobId}. Found ${assignments?.length} assignments.`)

    if (assignments && assignments.length > 0) {
      // Execute asynchronously to prevent python worker timeouts
      applySolverAssignments(req.payload, jobId, assignments)
    }

    return Response.json({ message: 'Schedule processing started asynchronously' })
  }
}
