import type { Payload } from 'payload'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Pick `n` random items from an array (no repeat). */
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

/** Return a random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Build an ISO timestamp for today at a given hour, offset by days. */
function todayAt(hour: number, offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour % 24, 0, 0, 0)
  return d.toISOString()
}

// ─────────────────────────────────────────────────────────────
// Tenant Templates
// ─────────────────────────────────────────────────────────────

const TENANTS = [
  {
    name: 'Apex Logistics',
    slug: 'apex-logistics',
    departments: ['Inbound Bay', 'Outbound Bay', 'Quality Control'],
    certifications: [
      { name: 'Forklift Operator', description: 'Certified to operate counterbalance forklifts.', days: 730 },
      { name: 'Hazardous Materials Handler', description: 'HAZMAT handling and disposal certification.', days: 365 },
      { name: 'First Aid & CPR', description: 'Basic life support certification.', days: 730 },
      { name: 'Cold Chain Specialist', description: 'Certified for temperature-controlled logistics.', days: 365 },
      { name: 'Fire Safety Warden', description: 'Emergency response and evacuation leader.', days: 365 },
    ],
  },
  {
    name: 'City Medical Centre',
    slug: 'city-medical',
    departments: ['Emergency Department', 'ICU Wing', 'Outpatient Clinic'],
    certifications: [
      { name: 'Registered Nurse (RN)', description: 'State-licensed registered nurse.', days: 365 },
      { name: 'Basic Life Support (BLS)', description: 'AHA-certified BLS provider.', days: 730 },
      { name: 'Advanced Cardiac Life Support (ACLS)', description: 'AHA ACLS certification.', days: 730 },
      { name: 'Infection Control Specialist', description: 'Certified in clinical infection prevention.', days: 365 },
      { name: 'Pediatric Advanced Life Support (PALS)', description: 'AHA PALS certification.', days: 730 },
    ],
  },
]

// 25 unique name combinations
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey',
  'Riley', 'Drew', 'Quinn', 'Avery', 'Blake',
  'Cameron', 'Dakota', 'Emery', 'Finley', 'Harper',
  'Hayden', 'Jamie', 'Jesse', 'Kendall', 'Lane',
  'Lee', 'Logan', 'Marlowe', 'Micah', 'Monroe',
]
const LAST_NAMES = [
  'Adams', 'Baker', 'Carter', 'Davis', 'Evans',
  'Foster', 'Green', 'Hall', 'Irving', 'Jones',
  'King', 'Lewis', 'Mason', 'Nelson', 'Owen',
  'Parker', 'Quinn', 'Ross', 'Scott', 'Turner',
  'Upton', 'Vance', 'Webb', 'Xavier', 'Young',
]

// ─────────────────────────────────────────────────────────────
// Main Seeder
// ─────────────────────────────────────────────────────────────

export const seedDatabase = async (payload: Payload) => {
  payload.logger.info('═══════════════════════════════════════════')
  payload.logger.info('  ShiftMatrix — Full Database Seed Starting ')
  payload.logger.info('═══════════════════════════════════════════')

  const results: Record<string, any> = {}

  for (const template of TENANTS) {
    payload.logger.info(`\n▶ Seeding tenant: ${template.name}`)

    // ── 1. Tenant ────────────────────────────────────────────
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: template.name,
        slug: template.slug,
        plan: 'enterprise',
        TenantSettings: [
          {
            blockType: 'FeatureToggles',
            enableOvertimeTracking: true,
            requireGeoFencedLogins: false,
            activateUnionRestRules: true,
            enableShiftBidding: true,
            enableSMSNotifications: false,
            enableAuditReports: true,
            maxWeeklyHours: 40,
          },
        ],
      },
    })
    payload.logger.info(`  ✔ Tenant — ID: ${tenant.id}`)

    // ── 2. Admin (1 per tenant) ───────────────────────────────
    const admin = await payload.create({
      collection: 'users',
      data: {
        email: `admin@${template.slug}.com`,
        password: 'password123',
        name: 'Admin User',
        role: 'admin',
        tenantId: tenant.id,
        maxWeeklyHours: 40,
      },
    })
    payload.logger.info(`  ✔ Admin — ${admin.email}`)

    // ── 3. Certifications (5 per tenant) ─────────────────────
    const certs: any[] = []
    for (const certDef of template.certifications) {
      const cert = await payload.create({
        collection: 'certifications',
        data: {
          name: certDef.name,
          description: certDef.description,
          validityPeriodDays: certDef.days,
          tenantId: tenant.id,
        },
      })
      certs.push(cert)
    }
    payload.logger.info(`  ✔ ${certs.length} certifications`)

    // ── 4. Departments (3 per tenant) ────────────────────────
    const departments: any[] = []
    for (const deptName of template.departments) {
      const dept = await payload.create({
        collection: 'departments',
        data: {
          name: deptName,
          location: `${template.name} — ${deptName}`,
          tenantId: tenant.id,
          requiredBaseCertifications: pickRandom(certs, randInt(1, 2)).map((c) => c.id),
        },
      })
      departments.push(dept)
    }
    payload.logger.info(`  ✔ ${departments.length} departments`)

    // ── 5. Workers (25 per tenant) ───────────────────────────
    const workers: any[] = []
    for (let i = 0; i < 25; i++) {
      const firstName = FIRST_NAMES[i]
      const lastName = LAST_NAMES[i]
      const workerCerts = pickRandom(certs, randInt(3, 5))

      const worker = await payload.create({
        collection: 'users',
        data: {
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${template.slug}.com`,
          password: 'password123',
          name: `${firstName} ${lastName}`,
          role: 'worker',
          tenantId: tenant.id,
          maxWeeklyHours: randInt(32, 40),
          certifications: workerCerts.map((c) => c.id),
          preferences: {
            preferredDepartments: pickRandom(departments, 1).map((d) => d.id),
          },
        },
      })
      workers.push(worker)
    }
    payload.logger.info(`  ✔ ${workers.length} workers`)

    // ── 6. Shifts (1 per department per day, 7 days) ──────────
    const shiftSlots = [
      { startH: 6, endH: 14 },   // Morning
      { startH: 14, endH: 22 },  // Afternoon
      { startH: 22, endH: 6 },   // Night (crosses midnight)
    ]

    let shiftCount = 0
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (const dept of departments) {
        const slot = shiftSlots[dayOffset % shiftSlots.length]
        const endDayOffset = slot.endH < slot.startH ? dayOffset + 1 : dayOffset
        const certForShift = pickRandom(certs, 1)[0]

        await payload.create({
          collection: 'shifts',
          data: {
            department: dept.id,
            tenantId: tenant.id,
            startTime: todayAt(slot.startH, dayOffset),
            endTime: todayAt(slot.endH, endDayOffset),
            status: dayOffset < 2 ? 'published' : 'draft',
            staffingRequirements: [
              {
                blockType: 'RoleRequirement',
                role: 'staff',
                count: randInt(2, 4),
                mustHaveCerts: certForShift ? [certForShift.id] : [],
              },
            ],
          },
        })
        shiftCount++
      }
    }
    payload.logger.info(`  ✔ ${shiftCount} shifts (7 days × ${departments.length} departments)`)

    results[template.slug] = { tenant, admin, certs, departments, workers }
  }

  payload.logger.info('\n═══════════════════════════════════════════')
  payload.logger.info('  Seeding complete ✔')
  payload.logger.info(`  Tenants     : ${TENANTS.length}`)
  payload.logger.info(`  Workers     : 25 per tenant  (${25 * TENANTS.length} total)`)
  payload.logger.info(`  Admins      : 1 per tenant   (${TENANTS.length} total)`)
  payload.logger.info(`  Certs       : 5 per tenant, randomly assigned`)
  payload.logger.info(`  Departments : 3 per tenant`)
  payload.logger.info(`  Shifts      : 21 per tenant  (${21 * TENANTS.length} total)`)
  payload.logger.info('═══════════════════════════════════════════\n')

  return results
}
