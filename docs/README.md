# ShiftMatrix Backend Architecture

Welcome to the ShiftMatrix Backend documentation. This backend is built on **Payload CMS 3.0** (Next.js 15) and serves as a multi-tenant operational engine for hospital and facility shift scheduling.

## Core Features

1. **Multi-Tenant Architecture**: Strict Data Isolation per hospital/facility via row-level security (`tenantId`).
2. **Automated Constraint-Based Scheduling**: An asynchronous Python worker powered by Google OR-Tools that auto-fills schedules based on complex union rules, maximum hours, and worker availability.
3. **Geo-Fenced Clock-ins**: A Haversine formula-backed system ensuring workers can only clock in when physically near their assigned Ward.
4. **Real-Time Notifications**: A Server-Sent Events (SSE) stream keeping web and mobile clients updated instantly without polling.

## Documentation Index

Please refer to the dedicated documentation files below for deep dives into specific systems:

- [Collections & Multi-Tenancy](./collections.md) - Database schema, Tenant logic, and Access Control.
- [Auto-Fill Scheduling Solver](./auto-fill-solver.md) - The asynchronous job-tracking pattern, Redis queue, and Python CP-SAT solver.
- [Geo-Fencing & Attendance](./geofencing-attendance.md) - `TimeLogs` logic, Haversine formula, and the `clock-in` endpoint.
- [Real-Time Notifications](./real-time-notifications.md) - Event emitters, SSE architecture, and urgent shift broadcasts.
- [Testing Guide](./testing-guide.md) - Instructions for running the integrated TypeScript (Vitest) and Python (unittest) test suites.

## Tech Stack
- **Framework**: Payload CMS v3 (Next.js 15 App Router)
- **Database**: PostgreSQL (via Payload Postgres Adapter)
- **Queue**: Redis (via ioredis)
- **Solver**: Python 3.11 + Google OR-Tools (CP-SAT) running in a Docker container
- **Testing**: Vitest for TypeScript API endpoints, `unittest` for Python microservice.
