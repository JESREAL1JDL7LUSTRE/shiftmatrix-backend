# ShiftMatrix Backend Documentation

Welcome to the ShiftMatrix Backend Documentation. This directory contains detailed guides and references for the architecture, database schemas, access control, and testing strategies used in this project.

## Table of Contents

1. [Architecture Overview](./architecture.md)
   - High-level overview of the stack (Payload CMS, Next.js, NeonDB, Drizzle ORM).
2. [Database Schema](./database_schema.md)
   - Detailed breakdown of all collections (Tenants, Users, Shifts, etc.) and deeply nested constraints.
3. [Access Control & RLS](./access_control.md)
   - Explanation of our Application-Level Row-Level Security (RLS) and multi-tenancy isolation.
4. [Algorithmic Scheduling](./algorithmic_scheduling.md)
   - How the asynchronous Google OR-Tools Constraint Programming microservice handles auto-fill requests.
5. [Testing & Migrations](./testing.md)
   - Guide on how the Vitest integration suite works, dynamic seeding, and Drizzle database push behaviors.

### Getting Started for Developers

If you are new to the project, start with the **[Architecture Overview](./architecture.md)** to understand how Payload CMS fits into the Next.js app, then review the **[Access Control](./access_control.md)** to understand how tenant isolation is enforced.
