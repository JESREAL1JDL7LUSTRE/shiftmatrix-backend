# Testing and Database Migrations

ShiftMatrix uses **Vitest** for integration testing to verify that database relations and Access Control (RLS) work correctly against the live database.

## Running Tests

```bash
npm run test:int
```

## How the Test Suite Works

1. **Initialization**: The test suite (`tests/int/*.spec.ts`) boots up the Next.js Payload instance dynamically in a Node environment (`getPayload()`).
2. **Database Push**: When Payload initializes, the Postgres adapter (via Drizzle ORM) automatically attempts to push the schema to the NeonDB database because we set `push: process.env.NODE_ENV !== 'production'` in `payload.config.ts`.
3. **Sequential Execution**: Tests are run sequentially (`fileParallelism: false` in `vitest.config.mts`) to prevent race conditions where multiple test files attempt to push identical schemas to NeonDB simultaneously.

## Dynamic Database Seeding

We execute integration tests against a **Persistent Database** (NeonDB). Since we do not drop the database between runs, we must prevent Unique Constraint violations.

To achieve this, the seeder (`tests/helpers/seed.ts`) appends dynamic timestamps to unique fields.
```typescript
const timestamp = Date.now()
const slug = `st-marys-${timestamp}`
const email = `worker-${timestamp}@stmarys.com`
```
This guarantees that you can run `npm run test:int` 1,000 times without the database crashing due to duplicate emails or tenant slugs.

## Troubleshooting Drizzle Migrations

If Drizzle fails during `pushDevSchema` with a constraint error or interactive prompt timeout, it is usually because:
1. **Interactive Prompts**: Drizzle detects a renamed column and wants user input. The test script includes `CI=true` to automatically bypass this. If it still gets stuck, slightly rename the Payload block `slug` to force Drizzle to treat it as a new table.
2. **Constraint Truncation**: Postgres limits identifiers to 63 characters. Payload auto-generates long foreign key names for nested blocks. Keep nested field names short (e.g., `cert` instead of `certificationId`).
