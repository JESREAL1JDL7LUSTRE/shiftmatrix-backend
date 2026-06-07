# Collections & Multi-Tenancy

ShiftMatrix is a true B2B SaaS platform. Every piece of data is strictly isolated by a `tenantId`.

## The Tenant Pattern

We employ Payload CMS row-level access control to isolate data. Every collection (except `Tenants` itself) requires a `tenantId` field.

### Access Control Logic
All collections use custom access control functions located in `src/access/tenant.ts`.
- **Admins**: Can read, create, update, and delete all records **within their specific tenant**.
- **Workers**: Can read records (Shifts, Wards) within their tenant, but have strict restrictions on modifications.

```typescript
// Example snippet from tenant.ts
export const tenantAccess: Access = ({ req: { user } }) => {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return { tenantId: { equals: user.tenantId } } as Where;
}
```

## Core Collections

- **Users**: Represents staff. Contains `role` (`admin`, `worker`), `certifications` (e.g., "RN", "CNA"), `maxWeeklyHours`, and relational access to `tenantId`.
- **Wards**: Physical locations within a facility. Contains `geolocation` data (`latitude`, `longitude`, `radiusMeters`) for clock-ins.
- **Shifts**: Blocks of time requiring a worker. Contains `startTime`, `endTime`, `ward`, and an array of `assignedStaff`. Shifts can be published or drafted.
- **Unavailabilities**: Blocks of time when a specific user is on PTO or unavailable. The Python solver strictly reads these to prevent scheduling overlapping shifts.
- **SchedulingRuns**: The job-tracking table for asynchronous auto-fill requests. Connects to the Redis queue.
- **TimeLogs**: Records of when users clock in/out. Includes the `isLate` boolean flag based on the shift start time.
- **Notifications**: System-wide or user-specific alerts that broadcast over SSE when created.
