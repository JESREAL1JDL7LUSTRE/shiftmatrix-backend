import unittest
from backend.src.solver_service.solver import solve_schedule

class TestSolver(unittest.TestCase):
    def test_basic_assignment(self):
        job_data = {
            "workers": [
                {"id": "w1", "certifications": ["RN"], "maxWeeklyHours": 40, "currentHours": 0},
                {"id": "w2", "certifications": ["LPN"], "maxWeeklyHours": 40, "currentHours": 0}
            ],
            "slots": [
                {
                    "shiftId": "s1", "blockIndex": 0, "durationHours": 8,
                    "startTimeMs": 1000, "endTimeMs": 2000, "requiredCerts": ["RN"]
                }
            ],
            "tenantSettings": {}
        }
        res = solve_schedule(job_data)
        self.assertTrue(res['success'])
        self.assertEqual(len(res['assignments']), 1)
        self.assertEqual(res['assignments'][0]['workerId'], "w1") # w2 doesn't have RN

    def test_overlap_rejection(self):
        job_data = {
            "workers": [
                {"id": "w1", "certifications": ["RN"], "maxWeeklyHours": 40, "currentHours": 0}
            ],
            "slots": [
                {
                    "shiftId": "s1", "blockIndex": 0, "durationHours": 8,
                    "startTimeMs": 1000, "endTimeMs": 5000, "requiredCerts": ["RN"]
                },
                {
                    "shiftId": "s2", "blockIndex": 0, "durationHours": 8,
                    "startTimeMs": 4000, "endTimeMs": 8000, "requiredCerts": ["RN"]
                }
            ],
            "tenantSettings": {}
        }
        # w1 cannot do both because they overlap (1000-5000 and 4000-8000)
        res = solve_schedule(job_data)
        self.assertFalse(res['success'])

    def test_union_rest_rules(self):
        # 12-hour gap = 43200000 ms
        gap_ms = 12 * 3600 * 1000
        
        job_data = {
            "workers": [
                {"id": "w1", "certifications": ["RN"], "maxWeeklyHours": 40, "currentHours": 0}
            ],
            "slots": [
                {
                    "shiftId": "s1", "blockIndex": 0, "durationHours": 8,
                    "startTimeMs": 1000, "endTimeMs": 10000, "requiredCerts": ["RN"]
                },
                {
                    "shiftId": "s2", "blockIndex": 0, "durationHours": 8,
                    "startTimeMs": 10000 + (gap_ms - 1000), "endTimeMs": 50000000, "requiredCerts": ["RN"]
                }
            ],
            "tenantSettings": {
                "activateUnionRestRules": True
            }
        }
        # Gap is slightly less than 12 hours, so should fail
        res = solve_schedule(job_data)
        self.assertFalse(res['success'])
        
        # Turn off union rules, should succeed
        job_data["tenantSettings"]["activateUnionRestRules"] = False
        res = solve_schedule(job_data)
        self.assertTrue(res['success'])

if __name__ == '__main__':
    unittest.main()
