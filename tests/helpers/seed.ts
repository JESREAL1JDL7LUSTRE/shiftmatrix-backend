import type { Payload } from 'payload'

export const seedDatabase = async (payload: Payload) => {
  payload.logger.info('Seeding database with initial ShiftMatrix data...')

  const timestamp = Date.now()

  // 1. Create a Tenant
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `St. Marys Hospital ${timestamp}`,
      slug: `st-marys-${timestamp}`,
      plan: 'enterprise',
      TenantSettings: [
        {
          blockType: 'FeatureToggles',
          enableOvertimeTracking: true,
          requireGeoFencedLogins: false,
          activateUnionRestRules: true,
          enableShiftBidding: true,
          maxWeeklyHours: 40,
        },
      ],
    },
  })

  // 2. Create an Admin
  const admin = await payload.create({
    collection: 'users',
    data: {
      email: `admin-${timestamp}@stmarys.com`,
      password: 'password123',
      name: 'Admin User',
      role: 'admin',
      tenantId: tenant.id,
    },
  })

  // 3. Create a Certification
  const icuCert = await payload.create({
    collection: 'certifications',
    data: {
      name: 'ICU Specialist',
      description: 'Intensive Care Unit Certified Practitioner',
      validityPeriodDays: 365,
      tenantId: tenant.id,
    },
  })

  // 4. Create a Ward
  const ward = await payload.create({
    collection: 'wards',
    data: {
      name: 'ICU Ward A',
      floor: '3rd Floor',
      tenantId: tenant.id,
      requiredBaseCertifications: [icuCert.id],
    },
  })

  // 5. Create a Worker
  const worker = await payload.create({
    collection: 'users',
    data: {
      email: `worker-${timestamp}@stmarys.com`,
      password: 'password123',
      name: 'John Doe',
      role: 'worker',
      tenantId: tenant.id,
      maxWeeklyHours: 40,
      certifications: [icuCert.id],
    },
  })

  // 6. Create a Shift
  const shift = await payload.create({
    collection: 'shifts',
    data: {
      ward: ward.id,
      tenantId: tenant.id,
      startTime: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
      endTime: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(),
      status: 'published',
      staffingRequirements: [
        {
          blockType: 'RoleRequirement',
          role: 'RN',
          count: 2,
          mustHaveCerts: [icuCert.id],
        },
      ],
    },
  })

  payload.logger.info('Seeding complete.')

  return { tenant, admin, icuCert, ward, worker, shift }
}
