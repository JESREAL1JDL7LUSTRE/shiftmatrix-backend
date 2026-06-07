import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import Redis from 'ioredis'

// Mock ioredis so we don't actually hit the queue during testing
vi.mock('ioredis', () => {
  return {
    default: class RedisMock {
      lpush = vi.fn().mockResolvedValue(1)
    }
  }
})

describe('Async Auto-Fill Endpoints', () => {
  let payload: any
  let tenantId: string
  let shiftId: string
  let worker1Id: string

  beforeAll(async () => {
    payload = await getPayload({ config })
    const timestamp = Date.now()

    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: `Queue Hospital ${timestamp}`,
        slug: `queue-hosp-${timestamp}`,
        plan: 'enterprise',
      }
    })
    tenantId = tenant.id

    const w1 = await payload.create({
      collection: 'users',
      data: {
        email: `async-worker-${timestamp}@flow.com`,
        password: 'test',
        name: 'Async Worker',
        role: 'worker',
        tenantId,
      }
    })
    worker1Id = w1.id

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(8, 0, 0, 0)
    
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(16, 0, 0, 0)

    const ward = await payload.create({
      collection: 'wards',
      data: {
        name: `Queue ER ${timestamp}`,
        floor: '1st',
        tenantId,
      }
    })

    const shift = await payload.create({
      collection: 'shifts',
      data: {
        ward: ward.id,
        tenantId,
        status: 'published',
        startTime: tomorrow.toISOString(),
        endTime: tomorrowEnd.toISOString(),
      }
    })
    shiftId = shift.id
  })

  it('Producer: should return 202 and queue the job', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(tomorrow)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const reqMock = {
      user: { tenantId, role: 'admin' },
      json: async () => ({
        startDate: tomorrow.toISOString(),
        endDate: nextWeek.toISOString()
      }),
      payload
    }

    const ShiftsConfig = payload.config.collections.find((c: any) => c.slug === 'shifts')
    const autoFillEndpoint = ShiftsConfig.endpoints.find((e: any) => e.path === '/auto-fill')
    
    const response = await autoFillEndpoint.handler(reqMock)
    const data = await response.json()

    expect(response.status).toBe(202)
    expect(data.jobId).toBeDefined()
    expect(data.status).toBe('processing')
  })

  it('Consumer (Webhook): should apply the solved matrix and update database', async () => {
    process.env.WORKER_SECRET = 'test_secret'
    const dynamicJobId = crypto.randomUUID()
    const payloadData = {
        success: true,
        jobId: dynamicJobId,
        assignments: [
          {
            workerId: worker1Id,
            shiftId: shiftId,
            blockIndex: 0
          }
        ]
    }
    
    const rawBody = JSON.stringify(payloadData)
    const signature = crypto.createHmac('sha256', 'test_secret').update(rawBody).digest('hex')

    // First create a fake pending run so it can be updated to completed
    await payload.create({
      collection: 'schedulingRuns',
      data: {
        jobId: dynamicJobId,
        tenantId,
        status: 'pending',
        shiftsInvolved: [shiftId]
      }
    })

    const reqMock = {
      text: async () => rawBody,
      headers: {
        get: (name: string) => name === 'x-webhook-signature' ? signature : null
      },
      payload
    }

    const ShiftsConfig = payload.config.collections.find((c: any) => c.slug === 'shifts')
    const webhookEndpoint = ShiftsConfig.endpoints.find((e: any) => e.path === '/solver-webhook')

    const response = await webhookEndpoint.handler(reqMock)
    expect(response.status).toBe(200)

    // Verify DB update
    const updatedShift = await payload.findByID({
      collection: 'shifts',
      id: shiftId
    })

    // It should be 'filled' because newStaff length is >= shiftReqCount (which defaults to 1 for this test)
    expect(updatedShift.status).toBe('filled')
    expect(updatedShift.assignedStaff.length).toBe(1)
    expect(updatedShift.assignedStaff[0].id).toBe(worker1Id)
  })
})
