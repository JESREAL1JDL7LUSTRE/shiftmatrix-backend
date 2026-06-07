# Testing Guide

We maintain extremely high code coverage to ensure enterprise-grade stability.

## 1. Running the TypeScript Integration Suite

The integration tests spin up a local instance of Payload CMS, seed it with data, and execute API requests against the endpoints to ensure the Database Access Control, Geofencing, and SSE emitters work perfectly.

**Prerequisites:**
- Ensure Postgres is running.
- Ensure Redis is running (or mocked, as done in `autoFillAsync.int.spec.ts`).

**Command:**
```bash
cd backend
npm run test:int
```

**What it tests:**
- `api.int.spec.ts`: Core Payload CMS initialization.
- `collections.int.spec.ts`: Tenant Access Control and Row Level Security.
- `clockIn.int.spec.ts`: Haversine formula distance logic and `isLate` detection.
- `notifications.int.spec.ts`: Ensures SSE event emitters correctly bubble up payload creations.
- `autoFillAsync.int.spec.ts`: Validates the Redis queue Producer (HTTP 202) and Webhook Consumer (HMAC validation).

## 2. Running the Python Solver Tests

The Python CP-SAT mathematical solver is isolated in a Docker container. We test it by passing it strictly formatted JSON mocks containing overlapping shifts, unavailabilities, and union-rest rule violations.

**Command:**
To run the tests inside the Docker context with the exact Python 3.11 environment:
```bash
cd backend
docker compose -f src/solver_service/docker-compose.yml run -v ${PWD}/src/solver_service:/app solver python -m unittest test_solver
```

**What it tests:**
- `test_basic_assignment`: Certifications and max hours constraints.
- `test_overlap_rejection`: Prevents a single worker from being assigned to simultaneous shifts.
- `test_union_rest_rules`: Ensures mandatory 12-hour gaps between shifts when activated.
- `test_unavailability_rejection`: Strictly fails if a shift time overlaps with a worker's requested `unavailabilityBlocks`.
