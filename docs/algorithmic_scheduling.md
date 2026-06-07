# Algorithmic Scheduling (Constraint Programming)

ShiftMatrix handles the complex, multi-variable logic of rostering through an asynchronous **Constraint Programming (CP)** microservice.

Unlike traditional Bipartite matching or Max-Flow graphs, Constraint Programming (via Google OR-Tools) guarantees a mathematically valid schedule that strictly adheres to overlapping constraints without "guessing" or running into dead ends.

## Architecture Flow

The scheduling engine is split across three distinct components:

1. **Job Producer (Payload CMS Endpoint)**
   - `POST /api/shifts/auto-fill`
   - Gathers all open shifts, available workers within the tenant, and tenant-specific settings.
   - Creates a new `SchedulingRuns` tracking record in the database with `status: pending`.
   - Formats the constraints into a strictly typed JSON payload and pushes it to the **Redis Queue**.
   - Returns a `202 Accepted` to the client instantly.

2. **Redis Message Broker**
   - A standard Redis instance running in Docker.
   - Acts as the buffer between the Next.js app and the Python worker.

3. **CP-SAT Solver Worker (Python)**
   - A lightweight `python:3.11-slim` service (`solver_service/worker.py`).
   - Polls the Redis queue via `brpop`.
   - Uses `google-ortools` to construct a multi-dimensional boolean matrix where $X(worker, shift) \in \{0, 1\}$.
   - Applies the mathematical constraints (e.g., maximum weekly hours, required certifications, no overlapping shifts, 12-hour union rest gaps).
   - Solves the matrix and immediately pushes the JSON assignment array back to Payload.

4. **Webhook Receiver (Payload CMS Endpoint)**
   - `POST /api/shifts/solver-webhook`
   - Validates the incoming payload using an **HMAC SHA-256 signature** verified against the `WORKER_SECRET` to prevent unauthorized database mutations.
   - **On Success**: Updates the `SchedulingRuns` record to `completed`, and updates all associated `Shifts` to `filled`, injecting the assigned staff.
   - **On Failure**: Updates the `SchedulingRuns` record to `failed` and saves the exact `errorReason`. Leaves the original `Shifts` completely untouched (Domain-Driven Design).

## Defining Constraints

Constraints are dynamically injected into the solver based on the Tenant Settings and Shift Blocks defined in Payload CMS.

### Example: Certification Enforcement
If a shift requires an "RN" certification, the Python worker creates a hard constraint:
```python
if not slot_certs.issubset(worker_certs):
    model.Add(x[(w, s)] == 0) # This worker cannot mathematically be assigned
```

### Example: Union Rest Rules
If the tenant has `activateUnionRestRules: true`, the solver enforces a mandatory 12-hour gap between any two shifts assigned to the same worker.
```python
if (end_time_1 + 12_hours > start_time_2) and (end_time_2 + 12_hours > start_time_1):
    model.AddImplication(x[(worker, shift_1)], x[(worker, shift_2)].Not())
```

## Running the Engine Locally

To test the scheduling engine, you must spin up the Redis and Python worker services via Docker:
## The INFEASIBLE State & Job Tracking Pattern
If a hospital admin requests a schedule that breaks mathematical constraints (e.g., they need 5 RNs, but only 3 are available, and union rules forbid overtime), the CP-SAT engine will fail to solve the matrix.

Rather than marking the physical Shifts as "failed" (which creates a UX nightmare of manually resetting them), the architecture uses a **Job Tracking Pattern**:
1. A shift is just an innocent block of time. The *attempt* to schedule is what fails.
2. The Python worker returns `success: false` with `reason: infeasible_constraints`.
3. The webhook marks the `SchedulingRun` document as `failed` and saves the reason.
4. The admin is notified to loosen constraints (allow overtime or bring in agency staff), and the original shifts remain safely `published`.

## Security: HMAC Webhook Signatures
Because the webhook inherently mutates shift data, it is secured via a shared secret. Both the Payload CMS backend and the Python Worker must share a `WORKER_SECRET` environment variable. The Python worker calculates an HMAC SHA-256 hash of the JSON body and sends it in the `x-webhook-signature` header. The Payload endpoint recalculates the hash and rejects the request if they do not match.

## Scaling for Production (Queue Starvation)
By default, the Python worker processes one schedule request at a time. In a multi-tenant environment, if Hospital A runs a massive schedule that takes 10 seconds to solve, Hospital B is stuck waiting in the Redis Queue.

To fix Queue Starvation, you can horizontally scale the Python worker natively in Docker. Because Redis guarantees atomic pops (`BRPOP`), multiple workers can safely pull from the same queue without overlap.

```bash
docker-compose up --scale solver=3 -d
```
This will spin up 3 identical Python containers, allowing 3 tenant schedules to be solved simultaneously.
