# System Architecture

ShiftMatrix uses a modern, serverless-ready stack centered around headless content management and edge-compatible databases.

## Technology Stack

- **Framework**: [Next.js (App Router)](https://nextjs.org/)
- **CMS / Backend**: [Payload CMS 3.x](https://payloadcms.com/)
- **Database**: [NeonDB (Serverless PostgreSQL)](https://neon.tech/)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) (Wrapped by Payload's Postgres Adapter)
- **Testing**: [Vitest](https://vitest.dev/)

## Core Concepts

### 1. Payload as a Native Next.js App
Unlike older versions of Payload that ran on a separate Express server, Payload 3.x is deeply integrated into Next.js. 
- API endpoints are automatically generated and mounted inside the Next.js App Router (e.g., `/api/users`).
- Payload Configuration (`src/payload.config.ts`) acts as the single source of truth for the database schema, access control, and admin UI.

### 2. Multi-Tenancy Architecture
ShiftMatrix is a multi-tenant B2B application. A single deployment serves multiple hospitals (Tenants). 
- Every critical collection includes a `tenantId` relationship field.
- Data isolation is strictly enforced at the application layer via Payload Access Control functions (not native Postgres RLS), ensuring that a user from Hospital A can never query or mutate data belonging to Hospital B.

### 3. Deeply Nested Constraints via Payload Blocks
Shift constraints (e.g., requiring 2 RNs with ICU certifications) are not stored in separate normalized relational tables. Instead, they leverage Payload's **Blocks** feature within the `Shifts` collection. This stores the constraints as structured JSONB arrays under the hood, allowing for extremely flexible constraint definitions without complex SQL JOINs.
