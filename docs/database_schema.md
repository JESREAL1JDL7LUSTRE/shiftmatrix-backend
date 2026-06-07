# Database Schema

The schema is defined in TypeScript within `src/collections/`. Payload CMS automatically translates these configurations into Drizzle ORM schemas and syncs them to NeonDB.

## Core Collections

### 1. Tenants (`src/collections/Tenants.ts`)
The root entity of the multi-tenancy model. Represents a hospital or organization.
- **Fields**: `name`, `slug`, `plan`
- **TenantSettings**: A flexible Block array containing toggleable features for the specific tenant (e.g., `enableOvertimeTracking`, `maxWeeklyHours`).

### 2. Users (`src/collections/Users.ts`)
Handles authentication and staff profiling. This collection combines traditional "Users" and "Staff" into a single scalable model.
- **Fields**: `name`, `role` (superadmin, admin, worker), `tenantId`, `maxWeeklyHours`, `certifications` (Relationship array).
- **Preferences**: A nested group field for shift scheduling parameters (e.g., preferred shift durations, preferred wards).

### 3. Wards (`src/collections/Wards.ts`)
Physical or logical locations within a Tenant where shifts occur.
- **Fields**: `name`, `floor`, `tenantId`
- **Required Base Certifications**: A relationship array defining baseline certifications required for *any* shift in this ward.

### 4. Certifications (`src/collections/Certifications.ts`)
Qualifications that staff members hold (e.g., RN, BLS, ICU Specialist).
- **Fields**: `name`, `description`, `validityPeriodDays`, `tenantId`.

### 5. Shifts (`src/collections/Shifts.ts`)
The core scheduling entity.
- **Fields**: `ward`, `tenantId`, `startTime`, `endTime`, `status` (draft, published, filled, cancelled).
- **StaffingRequirements**: A powerful Block array defining what is needed for the shift:
  - `RoleRequirement`: E.g., Needs 2 RNs.
  - `SpecialistReq`: E.g., Needs 1 staff member specifically holding the ICU certification.
  - `SupervisorRequirement`: E.g., Needs an experienced supervisor.

### 6. TimeLogs (`src/collections/TimeLogs.ts`)
An append-only ledger tracking clock-ins, clock-outs, and breaks.
- **Fields**: `eventType` (clock_in, clock_out, break_start, break_end), `timestamp`, `staffId`, `shiftId`, `tenantId`.
- **Note**: Modifying TimeLogs directly is restricted. It acts as an immutable audit trail.

### 7. SchedulingRuns (`src/collections/SchedulingRuns.ts`)
Implements the **Job Tracking Pattern** to decouple scheduling logic from physical shifts.
- **Fields**: `jobId` (unique UUID), `status` (pending, completed, failed), `errorReason`, `shiftsInvolved` (relationship), `tenantId`.
- **Why**: By tracking the *attempt* to schedule, a failed algorithmic run simply marks the `SchedulingRun` as failed with an `errorReason` (e.g., "infeasible constraints"), leaving the innocent `Shifts` untouched in their original `published` state.
