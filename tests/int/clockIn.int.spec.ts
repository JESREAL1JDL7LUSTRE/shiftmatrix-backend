import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload } from 'payload'
import config from '../../src/payload.config'


describe('Time, Attendance & Geo-Fencing', () => {
  let payload: any
  let tenantId: string
  let workerId: string
  let shiftId: string
  let wardId: string

  beforeAll(async () => {
    payload = await getPayload({ config })
    
    // 1. Create Tenant
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: 'Test Geo-Fence Hospital',
        slug: 'geo-hospital-' + Date.now(),
        plan: 'enterprise'
      }
    })
    tenantId = tenant.id

    // 2. Create Worker
    const worker = await payload.create({
      collection: 'users',
      data: {
        email: `geoworker-${Date.now()}@test.com`,
        password: 'password123',
        role: 'worker',
        name: 'Geo Worker',
        tenantId
      }
    })
    workerId = worker.id

    // 3. Create Ward with Geolocation (Empire State Building coords approx)
    const ward = await payload.create({
      collection: 'wards',
      data: {
        name: 'ER Ward',
        floor: '1',
        tenantId,
        geolocation: {
          latitude: 40.7484,
          longitude: -73.9857,
          radiusMeters: 500 // 500 meter geofence
        }
      }
    })
    wardId = ward.id

    // 4. Create Shift (Started 10 minutes ago to trigger 'isLate')
    const tenMinsAgo = new Date(Date.now() - 10 * 60000)
    const futureEnd = new Date(Date.now() + 8 * 3600000)
    
    const shift = await payload.create({
      collection: 'shifts',
      data: {
        ward: wardId,
        tenantId,
        status: 'published',
        startTime: tenMinsAgo.toISOString(),
        endTime: futureEnd.toISOString()
      }
    })
    shiftId = shift.id
  })

  it('should reject unauthenticated clock-ins', async () => {
    const reqMock = {
      json: async () => ({ shiftId, lat: 40.7484, lng: -73.9857, eventType: 'clock_in' }),
      user: null,
      payload
    }
    const res = await payload.config.endpoints!.find((e: any) => e.path === '/time-logs/clock-in')!.handler(reqMock as any)
    expect(res.status).toBe(401)
  })

  it('should clock in successfully within geofence and flag as late', async () => {
    const reqMock = {
      json: async () => ({ shiftId, lat: 40.7484, lng: -73.9857, eventType: 'clock_in' }),
      user: { id: workerId, role: 'worker', tenantId },
      payload
    }

    const res = await payload.config.endpoints!.find((e: any) => e.path === '/time-logs/clock-in')!.handler(reqMock as any)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.geofenceStatus).toBe('within_bounds')
    expect(data.isLate).toBe(true) // Because the shift started 10 minutes ago
  })

  it('should detect clock-ins outside the geofence radius', async () => {
    // Coordinate way outside (e.g. Central Park)
    const reqMock = {
      json: async () => ({ shiftId, lat: 40.7829, lng: -73.9654, eventType: 'clock_in' }),
      user: { id: workerId, role: 'worker', tenantId },
      payload
    }

    const res = await payload.config.endpoints!.find((e: any) => e.path === '/time-logs/clock-in')!.handler(reqMock as any)
    const data = await res.json()

    expect(res.status).toBe(201) // Still clocks them in, but flags them
    expect(data.geofenceStatus).toBe('outside_bounds')
  })
})
