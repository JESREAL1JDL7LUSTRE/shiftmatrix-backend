# engines/ — DEPRECATED (Dead Code in Production Path)

The TypeScript Edmonds-Karp Max-Flow solver (`autoFillEngine.ts`) and eligibility
checker (`rulesEngine.ts`) in this directory are **no longer called** by the production
code path. The `autoFillEndpoint.ts` delegates directly to the Python CP-SAT solver
via Redis queue.

## Why These Exist

These were the original Phase 1 synchronous scheduling engine before the async
Python/CP-SAT architecture was introduced. They are kept here for reference.

## Options (Decision Required)

**Option A — Archive (Recommended)**
Delete these files. The Python solver is the single source of truth.
Any new constraint (e.g., "max 3 night shifts per week") must be added to `solver.py` only.

**Option B — Pre-Flight Validator**
Re-wire `rulesEngine.ts` as a synchronous pre-flight check in the endpoint:
before pushing to the Redis queue, run `evaluateEligibility()` on the request
to give the Admin an instant (<50ms) rejection for obviously impossible requests
(e.g., 0 eligible workers). This keeps the async queue from being clogged with
unsolvable jobs.

If Option B is chosen, remove `autoFillEngine.ts` (the Edmonds-Karp graph solver —
too complex to maintain in parallel with Python) but keep `rulesEngine.ts` as
validation-only logic.
