# Auto-Fill Scheduling Solver

The most computationally heavy part of ShiftMatrix is generating a 7-day schedule that satisfies union rules, certifications, maximum weekly hours, and worker unavailability. We handle this asynchronously using the **Job Tracking Pattern**.

## Architecture Flow

1. **Producer (Payload Endpoint)**:
   An Admin clicks "Auto-Fill" on the frontend. The request hits `POST /api/shifts/auto-fill`.
   - The endpoint creates a `SchedulingRuns` record in the database with status `pending`.
   - It gathers all shifts, workers, and tenant settings for the requested date range.
   - It pushes a JSON payload containing this data into a Redis queue (`shift_jobs`).
   - It immediately returns HTTP 202 (Accepted) with the `jobId` so the frontend doesn't hang.

2. **Consumer (Python Worker)**:
   A lightweight Python service (`src/solver_service`) listens to the Redis queue.
   - It pops the job and parses the JSON.
   - It translates the business rules into Boolean constraints using **Google OR-Tools (CP-SAT)**.
   - It solves the matrix.
   - It sends an HMAC-SHA256 signed POST request back to Payload CMS (`/api/shifts/solver-webhook`).

3. **Webhook Receiver (Payload Endpoint)**:
   Payload CMS receives the webhook at `POST /api/shifts/solver-webhook`.
   - It verifies the cryptographic signature using `WORKER_SECRET`.
   - It iterates through the solved matrix and assigns the workers to the `Shifts` collection.
   - It updates the `SchedulingRuns` record to `completed` or `failed`.

## Constraints Enforced by Python Solver (`solver.py`)

- **Exactly One Worker Per Slot**: `model.AddExactlyOne(x[(w, s)] for w in range(num_workers))`
- **Certifications**: A worker cannot be assigned to an ICU shift if they lack the `ICU` certification.
- **Maximum Hours**: A worker cannot exceed their `maxWeeklyHours` constraint.
- **Unavailabilities**: Overlapping a worker's `unavailabilities` blocks is strictly `model.Add(x[(w, s)] == 0)`.
- **Rest Rules (Union)**: If `activateUnionRestRules` is toggled, it enforces a mandatory 12-hour gap between two shifts for the same worker.

## Handling Infeasible States
If an admin requests an impossible schedule (e.g., 10 shifts but only 2 workers with max 40 hours), the solver returns an `INFEASIBLE` status. The webhook updates the `SchedulingRuns` record to `failed` so the Admin knows they need to loosen constraints (e.g., allow overtime).
