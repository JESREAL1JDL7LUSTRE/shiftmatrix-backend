import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload } from 'payload'
import configPromise from '../../src/payload.config'
import { seedDatabase } from '../helpers/seed'

// Payload integration testing instance
let payload: any

describe('Collections Integration Tests', () => {
  beforeAll(async () => {
    // Initialize payload instance using the actual config
    payload = await getPayload({ config: configPromise })
  })

  it('should successfully seed the database with related entities', async () => {
    const { tenant, admin, worker, shift } = await seedDatabase(payload)
    
    expect(tenant).toBeDefined()
    expect(tenant.name).toContain('St. Marys Hospital')
    
    expect(admin).toBeDefined()
    expect(admin.role).toBe('admin')
    
    expect(worker).toBeDefined()
    expect(worker.role).toBe('worker')
    
    expect(shift).toBeDefined()
    expect(shift.status).toBe('published')
  })

  it('should enforce read restrictions via RLS for workers', async () => {
    // Get the worker ID we just created
    const workers = await payload.find({
      collection: 'users',
      where: { role: { equals: 'worker' } }
    })
    const workerId = workers.docs[0].id
    const tenantId = workers.docs[0].tenantId

    // Try to query users AS the worker (should only see themselves due to RLS)
    const result = await payload.find({
      collection: 'users',
      overrideAccess: false,
      user: { id: workerId, role: 'worker', tenantId }
    })

    // RLS: isSelfOrTenantAdmin ensures a worker can only read their own user record
    expect(result.docs.length).toBe(1)
    expect(result.docs[0].id).toBe(workerId)
  })
})
