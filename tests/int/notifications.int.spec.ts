import { describe, it, expect, beforeAll, vi } from 'vitest'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { notificationBus } from '../../src/infrastructure/NotificationBus'


describe('Omni-Channel Communications (Notifications)', () => {
  let payload: any
  let tenantId: string
  let workerId: string

  beforeAll(async () => {
    payload = await getPayload({ config })
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Comms Hospital', slug: 'comms-hosp-' + Date.now(), plan: 'enterprise' }
    })
    tenantId = tenant.id

    const worker = await payload.create({
      collection: 'users',
      data: {
        email: `commsworker-${Date.now()}@test.com`,
        password: 'pass',
        role: 'worker',
        name: 'Comms Worker',
        tenantId
      }
    })
    workerId = worker.id
  })

  it('should broadcast an event to the SSE Emitter when a new notification is created', async () => {
    // Spy on the infrastructure-level notification bus (correct import path)
    const emitSpy = vi.spyOn(notificationBus, 'emit')

    // Create a notification via Payload CMS
    await payload.create({
      collection: 'notifications',
      data: {
        message: 'Urgent: ER Shift Open!',
        type: 'urgent',
        recipientId: workerId,
        tenantId
      }
    })

    expect(emitSpy).toHaveBeenCalledWith('new_notification', expect.objectContaining({
      message: 'Urgent: ER Shift Open!',
      type: 'urgent'
    }))

    emitSpy.mockRestore()
  })
})
