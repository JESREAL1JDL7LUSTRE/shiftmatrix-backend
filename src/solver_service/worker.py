import os
import json
import time
import redis
import requests
import hmac
import hashlib
from solver import solve_schedule  # PYTHONPATH=/app set in Dockerfile

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
WEBHOOK_URL = os.getenv('WEBHOOK_URL', 'http://localhost:3000/api/shifts/solver-webhook')
WORKER_SECRET = os.getenv('WORKER_SECRET', '')
QUEUE_NAME = 'shift_solver_queue'

r = redis.from_url(REDIS_URL)

print(f"[*] Starting Python OR-Tools Worker. Listening on {QUEUE_NAME}...")

while True:
    try:
        # BRPOP blocks until a message is available
        result = r.brpop(QUEUE_NAME, timeout=0)
        if result:
            _, message = result
            job = json.loads(message)
            job_id = job.get('jobId')
            
            print(f"[*] Received job: {job_id}")
            
            # Solve
            solution = solve_schedule(job)
            solution['jobId'] = job_id
            
            # Webhook
            print(f"[*] Sending webhook for job: {job_id}")
            try:
                payload_str = json.dumps(solution)
                headers = {'Content-Type': 'application/json'}
                
                if WORKER_SECRET:
                    signature = hmac.new(
                        WORKER_SECRET.encode('utf-8'),
                        payload_str.encode('utf-8'),
                        hashlib.sha256
                    ).hexdigest()
                    headers['x-webhook-signature'] = signature

                resp = requests.post(WEBHOOK_URL, data=payload_str, headers=headers, timeout=5)
                print(f"[*] Webhook response: {resp.status_code}")
            except Exception as e:
                print(f"[!] Webhook failed: {e}")
                
    except Exception as e:
        print(f"[!] Error processing job: {e}")
        time.sleep(1)
