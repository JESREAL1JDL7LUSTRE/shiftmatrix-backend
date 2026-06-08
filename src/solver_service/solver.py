import json
from ortools.sat.python import cp_model
from datetime import datetime, timedelta

def solve_schedule(job_data: dict) -> dict:
    model = cp_model.CpModel()
    
    workers = job_data.get('workers', [])
    slots = job_data.get('slots', [])
    tenant_settings = job_data.get('tenantSettings', {})
    
    num_workers = len(workers)
    num_slots = len(slots)
    
    # x[w, s] is True if worker w is assigned to slot s
    x = {}
    for w in range(num_workers):
        # Pre-calculate unavailability check
        w_unavail = workers[w].get('unavailabilityBlocks', [])
        parsed_unavail = []
        for u in w_unavail:
            parsed_unavail.append((
                datetime.fromisoformat(u['startTime'].replace('Z', '+00:00')),
                datetime.fromisoformat(u['endTime'].replace('Z', '+00:00'))
            ))

        for s in range(num_slots):
            x[(w, s)] = model.NewBoolVar(f'w{w}_s{s}')
            
            # Constraint: Unavailability
            s_start = datetime.fromisoformat(slots[s].get('startTime', '').replace('Z', '+00:00'))
            s_end = datetime.fromisoformat(slots[s].get('endTime', '').replace('Z', '+00:00'))
            for u_start, u_end in parsed_unavail:
                if s_start < u_end and s_end > u_start:
                    model.Add(x[(w, s)] == 0)
            
    # Constraint 1: Maximize filled slots (each slot can have at most 1 worker)
    for s in range(num_slots):
        model.AddAtMostOne(x[(w, s)] for w in range(num_workers))
        
    # Constraint 2: Worker Certifications
    for w in range(num_workers):
        worker_certs = set(workers[w].get('certifications', []))
        for s in range(num_slots):
            slot_certs = set(slots[s].get('requiredCerts', []))
            # If the worker lacks required certs, x[w, s] must be 0
            if not slot_certs.issubset(worker_certs):
                model.Add(x[(w, s)] == 0)
                
    # Constraint 3: Max Weekly Hours
    for w in range(num_workers):
        worker_max = workers[w].get('maxWeeklyHours', tenant_settings.get('maxWeeklyHours', 40))
        current_hours = workers[w].get('currentHours', 0)
        
        # Calculate expected added hours
        # slot_hours * x[w,s]
        # Since CP-SAT works with integers, we can multiply hours by 10 to handle 0.5 hours, 
        # or just round to integers for simplicity. Let's multiply by 10.
        terms = []
        for s in range(num_slots):
            dur_hours = slots[s].get('durationHours', 0)
            terms.append(int(dur_hours * 10) * x[(w, s)])
            
        max_allowed = int((worker_max - current_hours) * 10)
        if max_allowed < 0:
            max_allowed = 0
            
        model.Add(sum(terms) <= max_allowed)
        
    # Constraint 4: Time Overlaps & Rest Rules
    gap_hours = 12 if tenant_settings.get('activateUnionRestRules', False) else 0
    gap_ms = gap_hours * 3600 * 1000

    for w in range(num_workers):
        for s1 in range(num_slots):
            for s2 in range(s1 + 1, num_slots):
                start1 = slots[s1].get('startTimeMs', 0)
                end1 = slots[s1].get('endTimeMs', 0)
                start2 = slots[s2].get('startTimeMs', 0)
                end2 = slots[s2].get('endTimeMs', 0)
                
                # Check overlap or rest gap violation
                # Condition: if end1 + gap > start2 AND end2 + gap > start1
                # Meaning they conflict
                if (end1 + gap_ms > start2) and (end2 + gap_ms > start1):
                    # Cannot do both shifts
                    model.AddImplication(x[(w, s1)], x[(w, s2)].Not())

    # Objective: Maximize assignments
    model.Maximize(sum(x[(w, s)] for w in range(num_workers) for s in range(num_slots)))
    
    solver = cp_model.CpSolver()
    # solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        assignments = []
        for w in range(num_workers):
            for s in range(num_slots):
                if solver.Value(x[(w, s)]):
                    assignments.append({
                        'workerId': workers[w].get('id'),
                        'shiftId': slots[s].get('shiftId'),
                        'blockIndex': slots[s].get('blockIndex')
                    })
        return {
            'success': True,
            'status': solver.StatusName(status),
            'assignments': assignments
        }
    else:
        return {
            'success': False,
            'status': solver.StatusName(status),
            'reason': 'infeasible_constraints' if status == cp_model.INFEASIBLE else 'No solution exists satisfying all constraints.'
        }
